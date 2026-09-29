'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '../supabase/server';
import { getTripContext } from '../queries/trips';
import { fieldErrors } from '../validation';
import { TRANSPORT_MODES } from '../itinerary/schedule';
import { fail, friendlyError, ok, type ActionResult } from './result';

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, 'layout');
}

/** Every mutation goes through this: membership is checked server side. */
async function requireMembership(tripId: string) {
  const context = await getTripContext(tripId);
  if (!context) return null;
  return context;
}

const localTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'รูปแบบเวลาไม่ถูกต้อง');

// ---------------------------------------------------------------------------
// days
// ---------------------------------------------------------------------------

const ensureDaysSchema = z.object({
  tripId: z.string().uuid(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(90),
  timeZone: z.string().min(1).max(64).optional(),
});

/** Creates any missing days for the trip's dates. Existing days are untouched. */
export async function ensureItineraryDaysAction(input: unknown): Promise<ActionResult> {
  const parsed = ensureDaysSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลวันไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('itinerary_days').upsert(
    value.dates.map((localDate) => ({
      trip_id: value.tripId,
      local_date: localDate,
      ...(value.timeZone ? { time_zone: value.timeZone } : {}),
    })),
    { onConflict: 'trip_id,local_date', ignoreDuplicates: true },
  );

  if (error) return fail(friendlyError(error, 'สร้างวันในแผนไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok(undefined);
}

const updateDaySchema = z.object({
  tripId: z.string().uuid(),
  dayId: z.string().uuid(),
  startLocalTime: localTime.optional(),
  timeZone: z.string().min(1).max(64).optional(),
  defaultTransportMode: z.enum(TRANSPORT_MODES).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export async function updateItineraryDayAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  const parsed = updateDaySchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลวันไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  // One function, one transaction. As two requests the version bumped even
  // when the update that followed it failed.
  const { data: version, error } = await supabase.rpc('update_itinerary_day', {
    p_trip_id: value.tripId,
    p_day_id: value.dayId,
    p_start_local_time: value.startLocalTime ?? null,
    p_time_zone: value.timeZone ?? null,
    p_default_transport_mode: value.defaultTransportMode ?? null,
    p_expected_version: value.expectedVersion ?? null,
  });

  if (error) return fail(friendlyError(error, 'บันทึกวันไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok({ version });
}

// ---------------------------------------------------------------------------
// stops
// ---------------------------------------------------------------------------

const addStopSchema = z.object({
  tripId: z.string().uuid(),
  dayId: z.string().uuid(),
  /**
   * The row's primary key, chosen by the client.
   *
   * A queued change survives the app being closed, so an add can be sent twice:
   * once before the tab went away and once when it comes back, with no way to
   * know whether the first one landed. Carrying the key makes the second one
   * collide with the first and do nothing, instead of creating the place twice.
   */
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อสถานที่').max(160),
  address: z.string().trim().max(400).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  arrivalLocalTime: z.union([localTime, z.null()]).optional(),
  departureLocalTime: z.union([localTime, z.null()]).optional(),
  placeProvider: z.string().max(32).default('manual'),
  placeId: z.string().max(200).nullable().optional(),
  visitDurationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export async function addItineraryStopAction(
  input: unknown,
): Promise<ActionResult<{ stopId: string; version: number }>> {
  const parsed = addStopSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลสถานที่ไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { data: version, error } = await supabase.rpc('add_itinerary_stop', {
    p_trip_id: value.tripId,
    p_day_id: value.dayId,
    p_id: value.id,
    p_name: value.name,
    p_address: value.address ?? null,
    p_latitude: value.latitude ?? null,
    p_longitude: value.longitude ?? null,
    p_place_provider: value.placeProvider,
    p_place_id: value.placeId ?? null,
    p_visit_duration_minutes: value.visitDurationMinutes ?? null,
    p_arrival_local_time: value.arrivalLocalTime ?? null,
    p_departure_local_time: value.departureLocalTime ?? null,
    p_expected_version: value.expectedVersion ?? null,
  });

  if (error) return fail(friendlyError(error, 'เพิ่มสถานที่ไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok({ stopId: value.id, version });
}

/**
 * Soft delete. The row stays so restoring it brings back its notes, its leg
 * preferences and any expense that references it.
 */
export async function deleteItineraryStopAction(
  tripId: string,
  stopId: string,
): Promise<ActionResult> {
  const context = await requireMembership(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('itinerary_stops')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', stopId)
    .eq('trip_id', tripId);

  if (error) return fail(friendlyError(error, 'ลบสถานที่ไม่สำเร็จ'));
  revalidateTrip(tripId);
  return ok(undefined);
}

/** "เลิกทำ" after a delete. */
export async function restoreItineraryStopAction(
  tripId: string,
  stopId: string,
): Promise<ActionResult> {
  const context = await requireMembership(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('itinerary_stops')
    .update({ deleted_at: null })
    .eq('id', stopId)
    .eq('trip_id', tripId);

  if (error) return fail(friendlyError(error, 'กู้คืนสถานที่ไม่สำเร็จ'));
  revalidateTrip(tripId);
  return ok(undefined);
}

const reorderSchema = z.object({
  tripId: z.string().uuid(),
  dayId: z.string().uuid(),
  stopIds: z.array(z.string().uuid()).min(1),
  expectedVersion: z.number().int().positive().optional(),
});

/** Runs inside one transaction in the database. */
export async function reorderItineraryStopsAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return fail('ลำดับไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { data: version, error } = await supabase.rpc('reorder_itinerary_stops', {
    p_day_id: value.dayId,
    p_stop_ids: value.stopIds,
    p_expected_version: value.expectedVersion ?? null,
  });

  if (error) return fail(friendlyError(error, 'จัดลำดับไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok({ version });
}

export async function moveItineraryStopAction(
  tripId: string,
  stopId: string,
  targetDayId: string,
): Promise<ActionResult> {
  const context = await requireMembership(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('move_itinerary_stop', {
    p_stop_id: stopId,
    p_target_day_id: targetDayId,
    p_expected_version: null,
  });

  if (error) return fail(friendlyError(error, 'ย้ายสถานที่ไม่สำเร็จ'));
  revalidateTrip(tripId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// leg preferences
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// one dialog, one save
// ---------------------------------------------------------------------------

const stopWithLegSchema = z.object({
  tripId: z.string().uuid(),
  stopId: z.string().uuid(),
  expectedVersion: z.number().int().positive().optional(),
  stop: z.object({
    name: z.string().trim().min(1, 'กรุณากรอกชื่อสถานที่').max(160),
    notes: z.string().trim().max(1000).nullable(),
    visitDurationMinutes: z.number().int().min(0).max(1440).nullable(),
    arrivalLocalTime: z.union([localTime, z.null()]),
    departureLocalTime: z.union([localTime, z.null()]),
    enabled: z.boolean(),
  }),
  /** Absent for the last enabled stop of the day, which has no onward journey. */
  leg: z
    .object({
      destinationStopId: z.string().uuid(),
      transportMode: z.enum(TRANSPORT_MODES),
      manualDurationMinutes: z.number().int().min(0).max(1440).nullable(),
      notes: z.string().trim().max(1000).nullable(),
    })
    .nullable()
    .optional(),
});

/**
 * Saves a place and its onward journey together.
 *
 * The edit dialog collects both, so they travel as one request: two separate
 * actions would double the latency and could leave the pair half-saved.
 */
export async function saveItineraryStopAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  const parsed = stopWithLegSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลสถานที่ไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  if (value.leg && value.leg.destinationStopId === value.stopId) {
    return fail('ต้นทางและปลายทางต้องเป็นคนละจุด');
  }

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  // The place and the journey out of it move together or not at all. As three
  // separate requests a failure on the last one left the day's version bumped
  // and the place already saved, while the caller was told the save failed.
  const { data: version, error } = await supabase.rpc('save_itinerary_stop', {
    p_trip_id: value.tripId,
    p_stop_id: value.stopId,
    p_name: value.stop.name,
    p_notes: value.stop.notes,
    p_visit_duration_minutes: value.stop.visitDurationMinutes,
    p_arrival_local_time: value.stop.arrivalLocalTime,
    p_departure_local_time: value.stop.departureLocalTime,
    p_enabled: value.stop.enabled,
    p_leg_destination_stop_id: value.leg?.destinationStopId ?? null,
    p_leg_transport_mode: value.leg?.transportMode ?? null,
    p_leg_manual_duration_minutes: value.leg?.manualDurationMinutes ?? null,
    p_leg_notes: value.leg?.notes ?? null,
    p_expected_version: value.expectedVersion ?? null,
  });

  if (error) return fail(friendlyError(error, 'บันทึกสถานที่ไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok({ version });
}
