'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../supabase/server';
import { getTripContext } from '../queries/trips';
import { fieldErrors, renameMemberSchema } from '../validation';
import { fail, friendlyError, ok, type ActionResult } from './result';

export async function renameMemberAction(
  tripId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = renameMemberSchema.safeParse(input);
  if (!parsed.success) return fail('ชื่อไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const target = context.allMembers.find((member) => member.id === value.memberId);
  if (!target) return fail('ไม่พบสมาชิกคนนี้');
  if (!target.isMe && !context.isOwner) {
    return fail('เปลี่ยนได้เฉพาะชื่อของตัวเอง');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('trip_members')
    .update({ display_name: value.displayName })
    .eq('id', value.memberId)
    .eq('trip_id', tripId);

  if (error) return fail(friendlyError(error, 'เปลี่ยนชื่อไม่สำเร็จ'));

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok(undefined);
}

export async function removeMemberAction(
  tripId: string,
  memberId: string,
): Promise<ActionResult> {
  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
  if (!context.isOwner) return fail('เฉพาะเจ้าของทริปเท่านั้นที่ลบสมาชิกได้');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('remove_trip_member', { p_member_id: memberId });

  if (error) return fail(friendlyError(error, 'ลบสมาชิกไม่สำเร็จ'));

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok(undefined);
}

export async function leaveTripAction(tripId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('leave_trip', { p_trip_id: tripId });

  if (error) return fail(friendlyError(error, 'ออกจากทริปไม่สำเร็จ'));

  revalidatePath('/trips');
  return ok(undefined);
}

/**
 * Does this member still appear in the trip's financial history?
 * The UI warns before removing them; the data itself is always preserved.
 */
export async function memberUsageAction(
  tripId: string,
  memberId: string,
): Promise<ActionResult<{ expenseCount: number; splitCount: number; settlementCount: number }>> {
  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const [paid, split, settled] = await Promise.all([
    supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .eq('payer_member_id', memberId)
      .is('deleted_at', null),
    supabase
      .from('expense_splits')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .eq('member_id', memberId),
    supabase
      .from('settlements')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .or(`from_member_id.eq.${memberId},to_member_id.eq.${memberId}`),
  ]);

  return ok({
    expenseCount: paid.count ?? 0,
    splitCount: split.count ?? 0,
    settlementCount: settled.count ?? 0,
  });
}
