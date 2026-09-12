'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../supabase/server';
import { getTripContext } from '../queries/trips';
import { listExpenses, listSettlements } from '../queries/expenses';
import { computeExpenseDebts } from '../settlement';
import { toCalcExpense } from '../trip-stats';
import { fromMinorUnits, toMinorUnits } from '../money';
import { fieldErrors, settlementInputSchema } from '../validation';
import { fail, friendlyError, ok, type ActionResult } from './result';

/** Records "A transferred X to B" and marks it paid. */
export async function recordSettlementAction(input: unknown): Promise<ActionResult> {
  const parsed = settlementInputSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลการโอนไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  if (value.fromMemberId === value.toMemberId) {
    return fail('ผู้โอนและผู้รับต้องเป็นคนละคน');
  }

  const context = await getTripContext(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const memberIds = new Set(context.allMembers.map((member) => member.id));
  if (!memberIds.has(value.fromMemberId) || !memberIds.has(value.toMemberId)) {
    return fail('ผู้โอนหรือผู้รับไม่ได้อยู่ในทริปนี้');
  }

  const amountMinor = toMinorUnits(value.amount, context.trip.baseCurrency);
  if (amountMinor <= 0) return fail('จำนวนเงินต้องมากกว่า 0');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('settlements').insert({
    trip_id: value.tripId,
    expense_id: value.expenseId ?? null,
    from_member_id: value.fromMemberId,
    to_member_id: value.toMemberId,
    amount_base: fromMinorUnits(amountMinor, context.trip.baseCurrency),
    status: 'paid',
    paid_at: new Date().toISOString(),
    note: value.note ?? null,
    created_by: user?.id ?? null,
  });

  if (error) {
    // The partial unique index rejects a second live payment for the same
    // expense and pair, which means someone else just marked it paid.
    if ((error as { code?: string }).code === '23505') {
      return fail('รายการนี้ถูกบันทึกว่าโอนแล้ว');
    }
    return fail(friendlyError(error, 'บันทึกการโอนไม่สำเร็จ'));
  }

  revalidatePath(`/trips/${value.tripId}`, 'layout');
  return ok(undefined);
}

/**
 * Marks every outstanding expense debt as paid in one go.
 *
 * The debts are recomputed here rather than taken from the client, so a
 * tampered-with payload cannot settle amounts that were never owed.
 */
export async function settleAllAction(
  tripId: string,
): Promise<ActionResult<{ settled: number }>> {
  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const currency = context.trip.baseCurrency;
  const [expenses, settlements] = await Promise.all([
    listExpenses(tripId, currency),
    listSettlements(tripId, currency),
  ]);

  const paid = new Set(
    settlements
      .filter((settlement) => settlement.status === 'paid' && settlement.expenseId)
      .map(
        (settlement) =>
          `${settlement.expenseId}:${settlement.fromMemberId}:${settlement.toMemberId}`,
      ),
  );

  const descriptionById = new Map(
    expenses.map((expense) => [expense.id, expense.description]),
  );

  const outstanding = computeExpenseDebts(expenses.map(toCalcExpense)).filter(
    (debt) => !paid.has(`${debt.expenseId}:${debt.fromMemberId}:${debt.toMemberId}`),
  );

  if (outstanding.length === 0) {
    return fail('ไม่มีรายการที่ยังไม่โอน');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();
  const { error } = await supabase.from('settlements').insert(
    outstanding.map((debt) => ({
      trip_id: tripId,
      expense_id: debt.expenseId,
      from_member_id: debt.fromMemberId,
      to_member_id: debt.toMemberId,
      amount_base: fromMinorUnits(debt.amountMinor, currency),
      status: 'paid' as const,
      paid_at: now,
      note: descriptionById.get(debt.expenseId) ?? null,
      created_by: user?.id ?? null,
    })),
  );

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return fail('มีบางรายการถูกบันทึกว่าโอนแล้วระหว่างนี้ กรุณาลองใหม่อีกครั้ง');
    }
    return fail(friendlyError(error, 'บันทึกการโอนไม่สำเร็จ'));
  }

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok({ settled: outstanding.length });
}

/** Undo a recorded transfer. The row is kept as `cancelled` for the history. */
export async function cancelSettlementAction(
  tripId: string,
  settlementId: string,
): Promise<ActionResult> {
  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('settlements')
    .update({ status: 'cancelled' })
    .eq('id', settlementId)
    .eq('trip_id', tripId);

  if (error) return fail(friendlyError(error, 'ยกเลิกรายการโอนไม่สำเร็จ'));

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok(undefined);
}

export async function restoreSettlementAction(
  tripId: string,
  settlementId: string,
): Promise<ActionResult> {
  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('settlements')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('trip_id', tripId);

  if (error) return fail(friendlyError(error, 'กู้คืนรายการโอนไม่สำเร็จ'));

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok(undefined);
}
