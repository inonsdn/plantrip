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

export const TRANSPORT_MODES = [
  'walking',
  'driving',
  'taxi',
  'transit',
  'train',
  'flight',
  'ferry',
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  walking: 'เดิน',
  driving: 'รถส่วนตัว',
  taxi: 'แท็กซี่',
  transit: 'รถสาธารณะ',
  train: 'รถไฟ',
  flight: 'เครื่องบิน',
  ferry: 'เรือ',
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
  /** null when "อยู่ที่นี่นานเท่าไร" is left unanswered. */
  visitMinutes: number | null;
  /** "ถึงกี่โมง", written down by hand. Overrides anything worked out. */
  arrivalMinutes: number | null;
  /** "ออกจากที่นี่กี่โมง", written down by hand. */
  departureMinutes: number | null;
  enabled: boolean;
}

export interface ScheduleInput {
  startMinutes: number;
  /** In itinerary order, including disabled stops (which are skipped). */
  stops: readonly ScheduleStopInput[];
  travelByLegKey: Readonly<Record<string, LegTravel>>;
}

/** Whether a time was written down or worked out from the times around it. */
export type TimeSource = 'stated' | 'derived';

/**
 * A time that contradicts the order of the list.
 *
 * Only ever raised by times somebody typed: a worked-out time cannot run
 * backwards, because it is built forwards from the one before it.
 */
export type ScheduleWarning =
  /** Leaving before arriving. */
  | { reason: 'departure_before_arrival' }
  /** Arriving before leaving the place before this one. */
  | { reason: 'arrival_before_previous_departure' };

export interface ScheduleStopResult {
  stopId: string;
  arrivalMinutes: number | null;
  departureMinutes: number | null;
  arrivalSource: TimeSource | null;
  departureSource: TimeSource | null;
  /** Idle time between getting there and the arrival time that was written down. */
  waitMinutes: number;
  visitMinutes: number | null;
  warning: ScheduleWarning | null;
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
}

export interface DaySchedule {
  startMinutes: number;
  endMinutes: number | null;
  stops: ScheduleStopResult[];
  legs: ScheduleLegResult[];
  totals: {
    travelMinutes: number;
    visitMinutes: number;
    /** Idle time from arrival times written down later than the plan reaches. */
    waitMinutes: number;
    /** Waiting reported by the provider inside transit legs, shown separately
        because it is already inside that leg's travel time. */
    transitWaitMinutes: number;
    /** Last known departure minus the day's start, or null. */
    elapsedMinutes: number | null;
    /** True while any time in the day runs backwards. */
    hasWarning: boolean;
  };
}

/** A leg is identified by its ordered pair of stops, never by position. */
export function legKey(originStopId: string, destinationStopId: string): string {
  return `${originStopId}->${destinationStopId}`;
}

/**
 * The plan's timeline.
 *
 * A time is either written down or worked out from the one before it, and
 * nothing is invented. Where neither is possible the time is simply unknown —
 * it is not an error, it does not spread to the stops below it, and it is not
 * worth a sentence on every card. A place with an arrival time of its own does
 * not care what came before it at all, which is what makes a plan editable in
 * any order rather than only from the top.
 *
 * The one thing worth saying out loud is a time that runs backwards, and that
 * can only ever come from a time somebody typed.
 */
export function computeDaySchedule(input: ScheduleInput): DaySchedule {
  const enabled = input.stops.filter((stop) => stop.enabled);

  const stops: ScheduleStopResult[] = [];
  const legs: ScheduleLegResult[] = [];

  let travelTotal = 0;
  let visitTotal = 0;
  let waitTotal = 0;
  let transitWaitTotal = 0;
  let hasWarning = false;

  let previousDeparture: number | null = null;

  for (const [index, stop] of enabled.entries()) {
    let travelMinutes: number | null = null;

    if (index > 0) {
      const origin = enabled[index - 1];
      const key = legKey(origin.id, stop.id);
      const travel = input.travelByLegKey[key] ?? { minutes: null, source: 'unknown' as const };
      const transitWait = travel.transitWaitMinutes ?? 0;
      travelMinutes = travel.minutes;

      const legArrival =
        previousDeparture !== null && travel.minutes !== null
          ? previousDeparture + travel.minutes
          : null;

      legs.push({
        legKey: key,
        originStopId: origin.id,
        destinationStopId: stop.id,
        departureMinutes: previousDeparture,
        arrivalMinutes: legArrival,
        travelMinutes: travel.minutes,
        source: travel.source,
        transitWaitMinutes: transitWait,
      });

      if (travel.minutes !== null) {
        travelTotal += travel.minutes;
        transitWaitTotal += transitWait;
      }
    }

    // Where the plan reaches this place on its own, if it can.
    const reached: number | null =
      index === 0
        ? input.startMinutes
        : previousDeparture !== null && travelMinutes !== null
          ? previousDeparture + travelMinutes
          : null;

    const arrival: number | null = stop.arrivalMinutes ?? reached;
    const arrivalSource: TimeSource | null =
      stop.arrivalMinutes !== null ? 'stated' : reached !== null ? 'derived' : null;

    // Getting there before the time written down is waiting, not an early start.
    const wait =
      stop.arrivalMinutes !== null && reached !== null && stop.arrivalMinutes > reached
        ? stop.arrivalMinutes - reached
        : 0;

    const stayedUntil: number | null =
      arrival !== null && stop.visitMinutes !== null ? arrival + stop.visitMinutes : null;

    const departure: number | null = stop.departureMinutes ?? stayedUntil;
    const departureSource: TimeSource | null =
      stop.departureMinutes !== null ? 'stated' : stayedUntil !== null ? 'derived' : null;

    let warning: ScheduleWarning | null = null;
    if (arrival !== null && departure !== null && departure < arrival) {
      warning = { reason: 'departure_before_arrival' };
    } else if (arrival !== null && previousDeparture !== null && arrival < previousDeparture) {
      warning = { reason: 'arrival_before_previous_departure' };
    }
    if (warning) hasWarning = true;

    stops.push({
      stopId: stop.id,
      arrivalMinutes: arrival,
      departureMinutes: departure,
      arrivalSource,
      departureSource,
      waitMinutes: wait,
      visitMinutes: stop.visitMinutes,
      warning,
    });

    if (stop.visitMinutes !== null) visitTotal += stop.visitMinutes;
    waitTotal += wait;
    previousDeparture = departure;
  }

  // The last time the day is known to reach, wherever that is.
  let endMinutes: number | null = null;
  for (const entry of stops) {
    if (entry.departureMinutes !== null) endMinutes = entry.departureMinutes;
    else if (entry.arrivalMinutes !== null) endMinutes = entry.arrivalMinutes;
  }

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
      hasWarning,
    },
  };
}

export const SCHEDULE_WARNINGS: Record<ScheduleWarning['reason'], string> = {
  departure_before_arrival: 'เวลาออกอยู่ก่อนเวลาถึง',
  arrival_before_previous_departure: 'เวลาถึงอยู่ก่อนเวลาออกของจุดก่อนหน้า',
};

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

/** `1500` -> `1.5 กม.`; `800` -> `800 ม.` */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${Math.round(meters)} ม.`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : String(Math.round(km))} กม.`;
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
