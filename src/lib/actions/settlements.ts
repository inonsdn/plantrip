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

/**
 * May the current user declare that money owed to `toMemberId` has arrived?
 * Only the person being paid can — except for a member added by name, who has
 * no account and so needs someone else to keep their books.
 */
function canConfirmReceipt(
  context: Awaited<ReturnType<typeof getTripContext>>,
  toMemberId: string,
): boolean {
  const receiver = context?.allMembers.find((member) => member.id === toMemberId);
  if (!receiver) return false;
  return receiver.userId === null || receiver.isMe;
}

/**
 * Records a transfer. Pressing "โอนแล้ว" on someone else's money files a
 * 'pending' claim that balances ignore until the receiver confirms it; the
 * receiver's own press settles it outright. The database enforces the same
 * rule, so this cannot be bypassed by calling the API directly.
 */
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

  const confirmed = canConfirmReceipt(context, value.toMemberId);

  const { error } = await supabase.from('settlements').insert({
    trip_id: value.tripId,
    expense_id: value.expenseId ?? null,
    from_member_id: value.fromMemberId,
    to_member_id: value.toMemberId,
    amount_base: fromMinorUnits(amountMinor, context.trip.baseCurrency),
    status: confirmed ? 'paid' : 'pending',
    paid_at: confirmed ? new Date().toISOString() : null,
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

/** The receiver confirms the money actually arrived. */
export async function confirmSettlementAction(
  tripId: string,
  settlementId: string,
): Promise<ActionResult> {
  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from('settlements')
    .select('to_member_id')
    .eq('id', settlementId)
    .eq('trip_id', tripId)
    .maybeSingle();

  if (!row) return fail('ไม่พบรายการโอนนี้');
  if (!canConfirmReceipt(context, row.to_member_id)) {
    return fail('ต้องให้ผู้รับเงินเป็นคนยืนยันว่าได้รับแล้ว');
  }

  const { error } = await supabase
    .from('settlements')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('trip_id', tripId);

  if (error) return fail(friendlyError(error, 'ยืนยันการรับเงินไม่สำเร็จ'));

  revalidatePath(`/trips/${tripId}`, 'layout');
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

  const live = new Map(
    settlements
      .filter((settlement) => settlement.status !== 'cancelled' && settlement.expenseId)
      .map((settlement) => [
        `${settlement.expenseId}:${settlement.fromMemberId}:${settlement.toMemberId}`,
        settlement,
      ]),
  );

  const descriptionById = new Map(
    expenses.map((expense) => [expense.id, expense.description]),
  );

  const debts = computeExpenseDebts(expenses.map(toCalcExpense));
  const toInsert: typeof debts = [];
  const toConfirm: string[] = [];

  for (const debt of debts) {
    const existing = live.get(`${debt.expenseId}:${debt.fromMemberId}:${debt.toMemberId}`);
    if (!existing) {
      toInsert.push(debt);
      continue;
    }
    // A claim someone else filed, which only the receiver may confirm.
    if (existing.status === 'pending' && canConfirmReceipt(context, debt.toMemberId)) {
      toConfirm.push(existing.id);
    }
  }

  if (toInsert.length === 0 && toConfirm.length === 0) {
    return fail('ไม่มีรายการที่ยังไม่โอน');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();

  if (toInsert.length > 0) {
    const { error } = await supabase.from('settlements').insert(
      toInsert.map((debt) => {
        const confirmed = canConfirmReceipt(context, debt.toMemberId);
        return {
          trip_id: tripId,
          expense_id: debt.expenseId,
          from_member_id: debt.fromMemberId,
          to_member_id: debt.toMemberId,
          amount_base: fromMinorUnits(debt.amountMinor, currency),
          status: confirmed ? ('paid' as const) : ('pending' as const),
          paid_at: confirmed ? now : null,
          note: descriptionById.get(debt.expenseId) ?? null,
          created_by: user?.id ?? null,
        };
      }),
    );

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return fail('มีบางรายการถูกบันทึกไปแล้วระหว่างนี้ กรุณาลองใหม่อีกครั้ง');
      }
      return fail(friendlyError(error, 'บันทึกการโอนไม่สำเร็จ'));
    }
  }

  if (toConfirm.length > 0) {
    const { error } = await supabase
      .from('settlements')
      .update({ status: 'paid', paid_at: now })
      .in('id', toConfirm)
      .eq('trip_id', tripId);

    if (error) return fail(friendlyError(error, 'ยืนยันการรับเงินไม่สำเร็จ'));
  }

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok({ settled: toInsert.length + toConfirm.length });
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
  const { data: row } = await supabase
    .from('settlements')
    .select('to_member_id')
    .eq('id', settlementId)
    .eq('trip_id', tripId)
    .maybeSingle();

  if (!row) return fail('ไม่พบรายการโอนนี้');
  if (!canConfirmReceipt(context, row.to_member_id)) {
    return fail('ต้องให้ผู้รับเงินเป็นคนยืนยันว่าได้รับแล้ว');
  }

  const { error } = await supabase
    .from('settlements')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('trip_id', tripId);

  if (error) return fail(friendlyError(error, 'กู้คืนรายการโอนไม่สำเร็จ'));

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok(undefined);
}
