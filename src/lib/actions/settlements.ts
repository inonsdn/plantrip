'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../supabase/server';
import { getTripContext } from '../queries/trips';
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
    from_member_id: value.fromMemberId,
    to_member_id: value.toMemberId,
    amount_base: fromMinorUnits(amountMinor, context.trip.baseCurrency),
    status: 'paid',
    paid_at: new Date().toISOString(),
    note: value.note ?? null,
    created_by: user?.id ?? null,
  });

  if (error) return fail(friendlyError(error, 'บันทึกการโอนไม่สำเร็จ'));

  revalidatePath(`/trips/${value.tripId}`, 'layout');
  return ok(undefined);
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
