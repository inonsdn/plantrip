'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '../supabase/server';
import { getTripContext } from '../queries/trips';
import { createTripSchema, fieldErrors } from '../validation';
import { fail, friendlyError, ok, type ActionResult } from './result';

export async function createTripAction(
  input: unknown,
): Promise<ActionResult<{ tripId: string }>> {
  const parsed = createTripSchema.safeParse(input);
  if (!parsed.success) {
    return fail('ข้อมูลทริปไม่ถูกต้อง', fieldErrors(parsed.error));
  }
  const value = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: value.name,
    p_destination: value.destination ?? '',
    p_start_date: value.startDate || null,
    p_end_date: value.endDate || null,
    p_base_currency: value.baseCurrency,
    p_owner_display_name: value.ownerDisplayName,
    p_secondary_currency: value.secondaryCurrency || null,
    p_secondary_rate: value.secondaryRate || null,
  });

  if (error || !data) return fail(friendlyError(error, 'สร้างทริปไม่สำเร็จ'));

  revalidatePath('/trips');
  return ok({ tripId: data });
}

const updateTripSchema = z
  .object({
    tripId: z.string().uuid(),
    name: z.string().trim().min(1, 'กรุณาตั้งชื่อทริป').max(120),
    destination: z.string().trim().max(160).default(''),
    startDate: z.string().trim().nullable().optional(),
    endDate: z.string().trim().nullable().optional(),
  })
  .refine(
    (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
    { message: 'วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น', path: ['endDate'] },
  );

export async function updateTripAction(input: unknown): Promise<ActionResult> {
  const parsed = updateTripSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลทริปไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await getTripContext(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');
  if (!context.isOwner) return fail('เฉพาะเจ้าของทริปเท่านั้นที่แก้ไขข้อมูลทริปได้');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('trips')
    .update({
      name: value.name,
      destination: value.destination ?? '',
      start_date: value.startDate || null,
      end_date: value.endDate || null,
    })
    .eq('id', value.tripId);

  if (error) return fail(friendlyError(error, 'บันทึกข้อมูลทริปไม่สำเร็จ'));

  revalidatePath(`/trips/${value.tripId}`, 'layout');
  revalidatePath('/trips');
  return ok(undefined);
}

export async function regenerateInviteTokenAction(
  tripId: string,
): Promise<ActionResult<{ inviteToken: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('regenerate_invite_token', { p_trip_id: tripId });

  if (error || !data) return fail(friendlyError(error, 'สร้างลิงก์ใหม่ไม่สำเร็จ'));

  revalidatePath(`/trips/${tripId}`, 'layout');
  return ok({ inviteToken: data });
}

export async function deleteTripAction(tripId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('delete_trip', { p_trip_id: tripId });

  if (error) return fail(friendlyError(error, 'ลบทริปไม่สำเร็จ'));

  revalidatePath('/trips');
  return ok(undefined);
}

export async function joinTripAction(
  inviteToken: string,
): Promise<ActionResult<{ tripId: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('join_trip_by_token', {
    p_token: inviteToken,
    p_display_name: null,
  });

  if (error || !data) return fail(friendlyError(error, 'เข้าร่วมทริปไม่สำเร็จ'));

  revalidatePath('/trips');
  return ok({ tripId: data });
}

const currencySchema = z.object({
  tripId: z.string().uuid(),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'สกุลเงินต้องเป็นรหัส 3 ตัวอักษร'),
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,8})?$/, 'กรอกอัตราแลกเปลี่ยนเป็นตัวเลข')
    .refine((value) => Number(value) > 0, 'อัตราแลกเปลี่ยนต้องมากกว่า 0'),
});

/** Adds a currency to the trip or updates its default rate. */
export async function upsertTripCurrencyAction(input: unknown): Promise<ActionResult> {
  const parsed = currencySchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลสกุลเงินไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await getTripContext(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('trip_currencies')
    .upsert(
      {
        trip_id: value.tripId,
        currency_code: value.currencyCode,
        default_exchange_rate: value.rate,
      },
      { onConflict: 'trip_id,currency_code' },
    );

  if (error) return fail(friendlyError(error, 'บันทึกสกุลเงินไม่สำเร็จ'));

  revalidatePath(`/trips/${value.tripId}`, 'layout');
  return ok(undefined);
}
