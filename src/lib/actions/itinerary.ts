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

export async function updateItineraryDayAction(input: unknown): Promise<ActionResult> {
  const parsed = updateDaySchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลวันไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error: versionError } = await supabase.rpc('bump_itinerary_day', {
    p_day_id: value.dayId,
    p_expected_version: value.expectedVersion ?? null,
  });
  if (versionError) return fail(friendlyError(versionError, 'บันทึกไม่สำเร็จ'));

  const { error } = await supabase
    .from('itinerary_days')
    .update({
      ...(value.startLocalTime ? { start_local_time: value.startLocalTime } : {}),
      ...(value.timeZone ? { time_zone: value.timeZone } : {}),
      ...(value.defaultTransportMode ? { default_transport_mode: value.defaultTransportMode } : {}),
    })
    .eq('id', value.dayId)
    .eq('trip_id', value.tripId);

  if (error) return fail(friendlyError(error, 'บันทึกวันไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// stops
// ---------------------------------------------------------------------------

const addStopSchema = z.object({
  tripId: z.string().uuid(),
  dayId: z.string().uuid(),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อสถานที่').max(160),
  address: z.string().trim().max(400).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  placeProvider: z.string().max(32).default('manual'),
  placeId: z.string().max(200).nullable().optional(),
  visitDurationMinutes: z.number().int().min(0).max(1440).default(60),
  expectedVersion: z.number().int().positive().optional(),
});

export async function addItineraryStopAction(
  input: unknown,
): Promise<ActionResult<{ stopId: string }>> {
  const parsed = addStopSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลสถานที่ไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();

  // The day must belong to this trip; the composite keys enforce it too, but
  // failing here gives a readable message instead of a constraint error.
  const { data: day } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('id', value.dayId)
    .eq('trip_id', value.tripId)
    .maybeSingle();
  if (!day) return fail('ไม่พบวันนี้ในแผนการเดินทาง');

  const { error: versionError } = await supabase.rpc('bump_itinerary_day', {
    p_day_id: value.dayId,
    p_expected_version: value.expectedVersion ?? null,
  });
  if (versionError) return fail(friendlyError(versionError, 'บันทึกไม่สำเร็จ'));

  const { data: last } = await supabase
    .from('itinerary_stops')
    .select('position')
    .eq('day_id', value.dayId)
    .is('deleted_at', null)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('itinerary_stops')
    .insert({
      day_id: value.dayId,
      trip_id: value.tripId,
      position: (last?.position ?? -1) + 1,
      place_provider: value.placeProvider,
      place_id: value.placeId ?? null,
      name: value.name,
      address: value.address ?? null,
      latitude: value.latitude,
      longitude: value.longitude,
      visit_duration_minutes: value.visitDurationMinutes,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error || !data) return fail(friendlyError(error, 'เพิ่มสถานที่ไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok({ stopId: data.id });
}

const updateStopSchema = z.object({
  tripId: z.string().uuid(),
  stopId: z.string().uuid(),
  name: z.string().trim().min(1).max(160).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  visitDurationMinutes: z.number().int().min(0).max(1440).optional(),
  notBeforeLocalTime: z.union([localTime, z.null()]).optional(),
  enabled: z.boolean().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export async function updateItineraryStopAction(input: unknown): Promise<ActionResult> {
  const parsed = updateStopSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลสถานที่ไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { data: stop } = await supabase
    .from('itinerary_stops')
    .select('day_id')
    .eq('id', value.stopId)
    .eq('trip_id', value.tripId)
    .maybeSingle();
  if (!stop) return fail('ไม่พบสถานที่นี้');

  const { error: versionError } = await supabase.rpc('bump_itinerary_day', {
    p_day_id: stop.day_id,
    p_expected_version: value.expectedVersion ?? null,
  });
  if (versionError) return fail(friendlyError(versionError, 'บันทึกไม่สำเร็จ'));

  const { error } = await supabase
    .from('itinerary_stops')
    .update({
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.notes !== undefined ? { notes: value.notes } : {}),
      ...(value.visitDurationMinutes !== undefined
        ? { visit_duration_minutes: value.visitDurationMinutes }
        : {}),
      ...(value.notBeforeLocalTime !== undefined
        ? { not_before_local_time: value.notBeforeLocalTime }
        : {}),
      ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    })
    .eq('id', value.stopId)
    .eq('trip_id', value.tripId);

  if (error) return fail(friendlyError(error, 'บันทึกสถานที่ไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok(undefined);
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
export async function reorderItineraryStopsAction(input: unknown): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return fail('ลำดับไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reorder_itinerary_stops', {
    p_day_id: value.dayId,
    p_stop_ids: value.stopIds,
    p_expected_version: value.expectedVersion ?? null,
  });

  if (error) return fail(friendlyError(error, 'จัดลำดับไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok(undefined);
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

const legSchema = z.object({
  tripId: z.string().uuid(),
  dayId: z.string().uuid(),
  originStopId: z.string().uuid(),
  destinationStopId: z.string().uuid(),
  transportMode: z.enum(TRANSPORT_MODES).optional(),
  selectedRouteReference: z.string().max(200).nullable().optional(),
  manualDurationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  visibleOnMap: z.boolean().optional(),
});

/**
 * Saves one leg's settings, keyed by its ordered pair of stops so a preference
 * can never be applied to a different journey.
 */
export async function saveItineraryLegAction(input: unknown): Promise<ActionResult> {
  const parsed = legSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลเส้นทางไม่ถูกต้อง', fieldErrors(parsed.error));
  const value = parsed.data;

  if (value.originStopId === value.destinationStopId) {
    return fail('ต้นทางและปลายทางต้องเป็นคนละจุด');
  }

  const context = await requireMembership(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  const { data: day } = await supabase
    .from('itinerary_days')
    .select('default_transport_mode')
    .eq('id', value.dayId)
    .eq('trip_id', value.tripId)
    .maybeSingle();
  if (!day) return fail('ไม่พบวันนี้ในแผนการเดินทาง');

  const { error } = await supabase.from('itinerary_leg_preferences').upsert(
    {
      day_id: value.dayId,
      trip_id: value.tripId,
      origin_stop_id: value.originStopId,
      destination_stop_id: value.destinationStopId,
      transport_mode: value.transportMode ?? day.default_transport_mode,
      ...(value.selectedRouteReference !== undefined
        ? { selected_route_reference: value.selectedRouteReference }
        : {}),
      ...(value.manualDurationMinutes !== undefined
        ? { manual_duration_minutes: value.manualDurationMinutes }
        : {}),
      ...(value.visibleOnMap !== undefined ? { visible_on_map: value.visibleOnMap } : {}),
    },
    { onConflict: 'day_id,origin_stop_id,destination_stop_id' },
  );

  if (error) return fail(friendlyError(error, 'บันทึกเส้นทางไม่สำเร็จ'));
  revalidateTrip(value.tripId);
  return ok(undefined);
}
