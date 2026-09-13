import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '../supabase/server';
import type { ItineraryDayView } from '../itinerary/types';
import type { TransportMode } from '../itinerary/schedule';

/**
 * Every planned day of a trip with its live stops and leg preferences.
 * Soft-deleted stops are excluded; the rows stay so "เลิกทำ" can restore them.
 */
export const getItinerary = cache(async function getItinerary(
  tripId: string,
): Promise<ItineraryDayView[]> {
  const supabase = await createSupabaseServerClient();

  const [{ data: days, error }, { data: stops }, { data: legs }] = await Promise.all([
    supabase.from('itinerary_days').select('*').eq('trip_id', tripId).order('local_date'),
    supabase
      .from('itinerary_stops')
      .select('*')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('position'),
    supabase.from('itinerary_leg_preferences').select('*').eq('trip_id', tripId),
  ]);

  if (error) throw new Error(error.message);
  if (!days) return [];

  return days.map((day) => ({
    id: day.id,
    tripId: day.trip_id,
    localDate: day.local_date,
    startLocalTime: day.start_local_time,
    timeZone: day.time_zone,
    defaultTransportMode: day.default_transport_mode as TransportMode,
    version: day.version,
    stops: (stops ?? [])
      .filter((stop) => stop.day_id === day.id)
      .map((stop) => ({
        id: stop.id,
        dayId: stop.day_id,
        position: stop.position,
        placeProvider: stop.place_provider,
        placeId: stop.place_id,
        name: stop.name,
        address: stop.address,
        latitude: stop.latitude === null ? null : Number(stop.latitude),
        longitude: stop.longitude === null ? null : Number(stop.longitude),
        visitDurationMinutes: stop.visit_duration_minutes,
        notBeforeLocalTime: stop.not_before_local_time,
        enabled: stop.enabled,
        notes: stop.notes,
      })),
    legPreferences: (legs ?? [])
      .filter((leg) => leg.day_id === day.id)
      .map((leg) => ({
        id: leg.id,
        dayId: leg.day_id,
        originStopId: leg.origin_stop_id,
        destinationStopId: leg.destination_stop_id,
        transportMode: leg.transport_mode as TransportMode,
        selectedRouteReference: leg.selected_route_reference,
        manualDurationMinutes: leg.manual_duration_minutes,
        visibleOnMap: leg.visible_on_map,
        notes: leg.notes,
      })),
  }));
});
