import type { ItineraryDayView, ItineraryStopView } from './types';

/**
 * The optimistic view of a change, applied to the days the server last sent.
 *
 * Every function here is pure and returns a new array: the queue keeps the
 * change on screen by replaying these over the server's data until the server
 * confirms, and throws them away when it refuses.
 */

function mapDay(
  days: readonly ItineraryDayView[],
  dayId: string,
  change: (day: ItineraryDayView) => ItineraryDayView,
): ItineraryDayView[] {
  return days.map((day) => (day.id === dayId ? change(day) : day));
}

/** Renumbers `position` so the order shown matches what will be saved. */
function renumber(stops: readonly ItineraryStopView[]): ItineraryStopView[] {
  return stops.map((stop, index) => ({ ...stop, position: index }));
}

export function reorderStops(
  days: readonly ItineraryDayView[],
  dayId: string,
  stopIds: readonly string[],
): ItineraryDayView[] {
  return mapDay(days, dayId, (day) => {
    const byId = new Map(day.stops.map((stop) => [stop.id, stop]));
    const ordered = stopIds
      .map((id) => byId.get(id))
      .filter((stop) => stop !== undefined);
    // Anything the caller did not mention keeps its place at the end rather
    // than vanishing from the list.
    const missing = day.stops.filter((stop) => !stopIds.includes(stop.id));
    return { ...day, stops: renumber([...ordered, ...missing]) };
  });
}

export function insertStop(
  days: readonly ItineraryDayView[],
  dayId: string,
  stop: ItineraryStopView,
): ItineraryDayView[] {
  return mapDay(days, dayId, (day) => ({
    ...day,
    stops: renumber([...day.stops, { ...stop, dayId }]),
  }));
}

export function removeStop(
  days: readonly ItineraryDayView[],
  stopId: string,
): ItineraryDayView[] {
  return days.map((day) =>
    day.stops.some((stop) => stop.id === stopId)
      ? {
          ...day,
          stops: renumber(day.stops.filter((stop) => stop.id !== stopId)),
          // A leg that pointed at the removed stop is no longer a leg.
          legPreferences: day.legPreferences.filter(
            (leg) => leg.originStopId !== stopId && leg.destinationStopId !== stopId,
          ),
        }
      : day,
  );
}

/** Moves a stop to the end of another day, as `move_itinerary_stop` does. */
export function moveStopToDay(
  days: readonly ItineraryDayView[],
  stopId: string,
  targetDayId: string,
): ItineraryDayView[] {
  const source = days.find((day) => day.stops.some((stop) => stop.id === stopId));
  const stop = source?.stops.find((candidate) => candidate.id === stopId);
  if (!source || !stop || source.id === targetDayId) return [...days];

  return insertStop(removeStop(days, stopId), targetDayId, { ...stop, dayId: targetDayId });
}

/** Day settings, as `updateItineraryDayAction` will store them. */
export function updateDay(
  days: readonly ItineraryDayView[],
  dayId: string,
  change: {
    startLocalTime: string;
    timeZone: string;
    defaultTransportMode: ItineraryDayView['defaultTransportMode'];
  },
): ItineraryDayView[] {
  return mapDay(days, dayId, (day) => ({ ...day, ...change }));
}

/**
 * One place and the journey out of it, as `saveItineraryStopAction` stores them.
 *
 * The leg is keyed by the ordered pair of stops, so an existing preference for
 * that exact pair is updated and anything else is left alone — a preference for
 * a pair that is no longer adjacent stays where it is, ready if the order comes
 * back.
 */
export function updateStop(
  days: readonly ItineraryDayView[],
  stopId: string,
  stop: {
    name: string;
    notes: string | null;
    visitDurationMinutes: number | null;
    notBeforeLocalTime: string | null;
    enabled: boolean;
  },
  leg: {
    destinationStopId: string;
    transportMode: ItineraryDayView['defaultTransportMode'];
    manualDurationMinutes: number | null;
    notes: string | null;
  } | null,
): ItineraryDayView[] {
  return days.map((day) => {
    if (!day.stops.some((candidate) => candidate.id === stopId)) return day;

    const stops = day.stops.map((candidate) =>
      candidate.id === stopId ? { ...candidate, ...stop } : candidate,
    );

    if (!leg) return { ...day, stops };

    const existing = day.legPreferences.find(
      (preference) =>
        preference.originStopId === stopId &&
        preference.destinationStopId === leg.destinationStopId,
    );

    const legPreferences = existing
      ? day.legPreferences.map((preference) =>
          preference.id === existing.id ? { ...preference, ...leg } : preference,
        )
      : [
          ...day.legPreferences,
          {
            // Only this optimistic view ever sees this id; the real row
            // replaces it when the server answers.
            id: `optimistic:${stopId}->${leg.destinationStopId}`,
            dayId: day.id,
            originStopId: stopId,
            selectedRouteReference: null,
            visibleOnMap: true,
            ...leg,
          },
        ];

    return { ...day, stops, legPreferences };
  });
}
