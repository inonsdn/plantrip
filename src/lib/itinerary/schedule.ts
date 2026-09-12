/**
 * The single authoritative timeline calculation for a planned day.
 *
 * Nothing derived here is ever stored: arrival, departure and waiting are
 * recomputed from the inputs every time, so there is no second copy to drift.
 *
 * All times are minutes since local midnight of the day's own date and may
 * exceed 1440 when the plan runs past midnight — the day offset is kept rather
 * than wrapped, so "01:00 (+1)" is distinguishable from "01:00".
 */

export const TRANSPORT_MODES = ['driving', 'transit', 'walking'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  driving: 'รถส่วนตัว',
  transit: 'รถสาธารณะ',
  walking: 'เดิน',
};

/** Where a leg's travel time came from. `unknown` means we genuinely do not know. */
export type TravelSource = 'provider' | 'manual' | 'unknown';

export interface LegTravel {
  /** null when no provider result and no manual duration exists. */
  minutes: number | null;
  source: TravelSource;
  /** Waiting the provider reported inside the leg, e.g. on a transit platform. */
  transitWaitMinutes?: number;
}

export interface ScheduleStopInput {
  id: string;
  visitMinutes: number;
  /** "ถึงไม่ก่อนเวลา", minutes since local midnight, or null. */
  notBeforeMinutes: number | null;
  enabled: boolean;
}

export interface ScheduleInput {
  startMinutes: number;
  /** In itinerary order, including disabled stops (which are skipped). */
  stops: readonly ScheduleStopInput[];
  travelByLegKey: Readonly<Record<string, LegTravel>>;
}

export interface ScheduleStopResult {
  stopId: string;
  arrivalMinutes: number | null;
  departureMinutes: number | null;
  /** Idle time forced by "ถึงไม่ก่อนเวลา". */
  waitMinutes: number;
  visitMinutes: number;
  /** True when an upstream travel time is unknown, so this time cannot be known. */
  incomplete: boolean;
}

export interface ScheduleLegResult {
  legKey: string;
  originStopId: string;
  destinationStopId: string;
  departureMinutes: number | null;
  arrivalMinutes: number | null;
  travelMinutes: number | null;
  source: TravelSource;
  transitWaitMinutes: number;
  incomplete: boolean;
}

export interface DaySchedule {
  startMinutes: number;
  endMinutes: number | null;
  stops: ScheduleStopResult[];
  legs: ScheduleLegResult[];
  totals: {
    travelMinutes: number;
    visitMinutes: number;
    /** Idle time from "ถึงไม่ก่อนเวลา" constraints. */
    waitMinutes: number;
    /** Waiting reported by the provider inside transit legs, shown separately
        because it is already inside that leg's travel time. */
    transitWaitMinutes: number;
    /** End minus start. null while any travel time is unknown. */
    elapsedMinutes: number | null;
    complete: boolean;
  };
}

/** A leg is identified by its ordered pair of stops, never by position. */
export function legKey(originStopId: string, destinationStopId: string): string {
  return `${originStopId}->${destinationStopId}`;
}

export function computeDaySchedule(input: ScheduleInput): DaySchedule {
  const enabled = input.stops.filter((stop) => stop.enabled);

  const stops: ScheduleStopResult[] = [];
  const legs: ScheduleLegResult[] = [];

  let travelTotal = 0;
  let visitTotal = 0;
  let waitTotal = 0;
  let transitWaitTotal = 0;

  // Becomes true at the first unknown travel time and never resets: everything
  // after it is genuinely unknowable, and assuming zero would be a lie.
  let incomplete = false;
  let previousDeparture: number | null = null;

  for (const [index, stop] of enabled.entries()) {
    if (index > 0) {
      const origin = enabled[index - 1];
      const key = legKey(origin.id, stop.id);
      const travel = input.travelByLegKey[key] ?? { minutes: null, source: 'unknown' as const };
      const transitWait = travel.transitWaitMinutes ?? 0;

      const legIncomplete = incomplete || travel.minutes === null;
      const departure: number | null = incomplete ? null : previousDeparture;
      const arrival: number | null =
        departure !== null && travel.minutes !== null ? departure + travel.minutes : null;

      legs.push({
        legKey: key,
        originStopId: origin.id,
        destinationStopId: stop.id,
        departureMinutes: departure,
        arrivalMinutes: arrival,
        travelMinutes: travel.minutes,
        source: travel.source,
        transitWaitMinutes: transitWait,
        incomplete: legIncomplete,
      });

      if (travel.minutes !== null) {
        travelTotal += travel.minutes;
        transitWaitTotal += transitWait;
      }
      if (travel.minutes === null) incomplete = true;
      previousDeparture = arrival;
    }

    const arrival: number | null = index === 0 ? input.startMinutes : previousDeparture;

    if (incomplete || arrival === null) {
      stops.push({
        stopId: stop.id,
        arrivalMinutes: null,
        departureMinutes: null,
        waitMinutes: 0,
        visitMinutes: stop.visitMinutes,
        incomplete: true,
      });
      visitTotal += stop.visitMinutes;
      previousDeparture = null;
      continue;
    }

    // "ถึงไม่ก่อนเวลา": arriving early turns into waiting, not an early start.
    const wait =
      stop.notBeforeMinutes !== null && arrival < stop.notBeforeMinutes
        ? stop.notBeforeMinutes - arrival
        : 0;
    const departure: number = arrival + wait + stop.visitMinutes;

    stops.push({
      stopId: stop.id,
      arrivalMinutes: arrival,
      departureMinutes: departure,
      waitMinutes: wait,
      visitMinutes: stop.visitMinutes,
      incomplete: false,
    });

    visitTotal += stop.visitMinutes;
    waitTotal += wait;
    previousDeparture = departure;
  }

  const lastStop = stops[stops.length - 1];
  const endMinutes = lastStop && !lastStop.incomplete ? lastStop.departureMinutes : null;

  return {
    startMinutes: input.startMinutes,
    endMinutes,
    stops,
    legs,
    totals: {
      travelMinutes: travelTotal,
      visitMinutes: visitTotal,
      waitMinutes: waitTotal,
      transitWaitMinutes: transitWaitTotal,
      elapsedMinutes: endMinutes === null ? null : endMinutes - input.startMinutes,
      complete: !incomplete,
    },
  };
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

/** `1500` -> `{ clock: '01:00', dayOffset: 1 }` */
export function splitClock(minutes: number): { clock: string; dayOffset: number } {
  const dayOffset = Math.floor(minutes / 1440);
  const within = ((minutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(within / 60)).padStart(2, '0');
  const mins = String(within % 60).padStart(2, '0');
  return { clock: `${hours}:${mins}`, dayOffset };
}

/** `1500` -> `01:00 (+1)`; null -> `—`. */
export function formatClock(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const { clock, dayOffset } = splitClock(minutes);
  return dayOffset > 0 ? `${clock} (+${dayOffset})` : clock;
}

/** `95` -> `1 ชม. 35 นาที`; `0` -> `0 นาที`. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ชม.` : `${hours} ชม. ${rest} นาที`;
}

/** `'09:30'` -> `570`. Returns null for anything unparseable. */
export function parseLocalTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** `570` -> `'09:30'`, wrapped into a single day for storage in a `time` column. */
export function toLocalTime(minutes: number): string {
  return splitClock(minutes).clock;
}
