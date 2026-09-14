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
