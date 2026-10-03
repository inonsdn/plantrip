/**
 * What the timeline says, decided once and in one place.
 *
 * `computeDaySchedule` works out the clock; this works out the sentence. Both
 * are plain data, so the two rules that matter here can be tested rather than
 * eyeballed:
 *
 *   - a journey nobody has timed is never "0 นาที" — null and zero are
 *     different answers, and only one of them came from a person;
 *   - a day whose totals cover only part of itself never presents them as a
 *     finished total.
 *
 * It also stops the list repeating itself. When the clock runs out part way
 * down a day, every row after it is equally unknowable, and saying so on each
 * one is the noise this app has already been told off for. Only the first row
 * of a run explains itself; the rest stay quiet.
 */

import type { ResolvedLeg } from './legs';
import {
  TRANSPORT_MODE_LABELS,
  formatClock,
  formatDuration,
  splitClock,
  type DaySchedule,
  type TransportMode,
} from './schedule';

// ---------------------------------------------------------------------------
// one stop
// ---------------------------------------------------------------------------

export type StopTimeLine =
  /** Both ends known: `10:00 – 14:00`. */
  | { kind: 'range'; text: string }
  /** One end known: `ถึง 10:00`. */
  | { kind: 'partial'; text: string }
  /** Neither end known, and this is the row that explains why. */
  | { kind: 'blocked'; text: string }
  /** Neither end known, and the row above already said so. */
  | { kind: 'silent' };

/**
 * A line of time for each stop, in order.
 *
 * Keyed by stop id. Stops left out of the plan are not in `schedule.stops` and
 * so are not here either.
 */
export function stopTimeLines(schedule: DaySchedule): Map<string, StopTimeLine> {
  const arrivingLeg = new Map(schedule.legs.map((leg) => [leg.destinationStopId, leg]));
  const lines = new Map<string, StopTimeLine>();

  // Whether the row above was a blocked one that already gave the reason.
  let explained = false;

  for (const stop of schedule.stops) {
    const { arrivalMinutes: arrival, departureMinutes: departure } = stop;

    if (arrival !== null && departure !== null) {
      lines.set(stop.stopId, {
        kind: 'range',
        text: `${formatClock(arrival)} – ${formatClock(departure)}`,
      });
      explained = false;
      continue;
    }

    if (arrival !== null || departure !== null) {
      lines.set(stop.stopId, {
        kind: 'partial',
        text: arrival !== null ? `ถึง ${formatClock(arrival)}` : `ออก ${formatClock(departure)}`,
      });
      explained = false;
      continue;
    }

    if (explained) {
      lines.set(stop.stopId, { kind: 'silent' });
      continue;
    }

    // The clock stopped somewhere above. Which of the two links is missing is
    // the difference between "fill in the journey" and "fill in the stop", so
    // it is worth the four extra words.
    const leg = arrivingLeg.get(stop.stopId);
    const waitingOnTravel = leg !== undefined && leg.departureMinutes !== null;
    lines.set(stop.stopId, {
      kind: 'blocked',
      text: waitingOnTravel ? 'รอเวลาเดินทาง' : 'รอเวลาของจุดก่อนหน้า',
    });
    explained = true;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// the journey between two stops
// ---------------------------------------------------------------------------

export interface TravelLine {
  legKey: string;
  /** Whose dialog the row opens: the leg is edited from the stop it leaves. */
  originStopId: string;
  mode: TransportMode;
  /** `รถไฟ · 35 นาที`, or `รถไฟ` when only the mode was ever chosen. */
  text: string;
}

/**
 * The journeys worth drawing, keyed by the stop each one arrives at.
 *
 * A pair that has neither a time nor a mode anybody picked gets no row: its
 * mode is only the day's default, so a row would be the app talking to itself.
 */
export function travelLines(
  schedule: DaySchedule,
  legs: readonly ResolvedLeg[],
): Map<string, TravelLine> {
  const timingByKey = new Map(schedule.legs.map((leg) => [leg.legKey, leg]));
  const lines = new Map<string, TravelLine>();

  for (const leg of legs) {
    const minutes = timingByKey.get(leg.legKey)?.travelMinutes ?? null;
    if (minutes === null && !leg.fromStoredPreference) continue;

    const label = TRANSPORT_MODE_LABELS[leg.transportMode];
    lines.set(leg.destinationStopId, {
      legKey: leg.legKey,
      originStopId: leg.originStopId,
      mode: leg.transportMode,
      // `minutes === null` is "nobody said"; `0` is somebody saying none at
      // all. Formatting the first would turn a blank into a claim.
      text: minutes === null ? label : `${label} · ${formatDuration(minutes)}`,
    });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// the day
// ---------------------------------------------------------------------------

export interface DaySummary {
  /** `เริ่ม 09:00 · เวลาญี่ปุ่น` */
  startLine: string;
  /** The parts that are true: `จบ 19:30`, `รวม 10 ชม.`, `เที่ยว 2 ชม.`. */
  facts: string[];
  /** What the totals above are missing, or null when they are the whole day. */
  caveat: string | null;
  crossesMidnight: boolean;
}

/**
 * The two lines above the list.
 *
 * `elapsedMinutes` is the last *known* departure minus the start, which on a
 * half-filled day is a real number for an unreal span — it would read like a
 * finished day that happens to be short. It is therefore only shown as a total
 * once every stop and every journey in the day has a time; otherwise the parts
 * that are true are shown with what they are missing spelled out beside them.
 */
export function describeDay(schedule: DaySchedule, timeZoneLabel: string): DaySummary {
  const startLine = `เริ่ม ${formatClock(schedule.startMinutes)} · ${timeZoneLabel}`;
  const crossesMidnight =
    schedule.endMinutes !== null && splitClock(schedule.endMinutes).dayOffset > 0;

  if (schedule.stops.length === 0) {
    return { startLine, facts: [], caveat: 'ยังไม่มีสถานที่ในวันนี้', crossesMidnight };
  }

  const untimedStops = schedule.stops.filter(
    (stop) => stop.arrivalMinutes === null || stop.departureMinutes === null,
  ).length;
  const untimedLegs = schedule.legs.filter((leg) => leg.travelMinutes === null).length;
  const complete = untimedStops === 0 && untimedLegs === 0;

  const facts: string[] = [];
  if (complete && schedule.endMinutes !== null) {
    facts.push(`จบ ${formatClock(schedule.endMinutes)}`);
    if (schedule.totals.elapsedMinutes !== null) {
      facts.push(`รวม ${formatDuration(schedule.totals.elapsedMinutes)}`);
    }
  }
  if (schedule.totals.visitMinutes > 0) {
    facts.push(`เที่ยว ${formatDuration(schedule.totals.visitMinutes)}`);
  }
  if (schedule.totals.travelMinutes > 0) {
    facts.push(`เดินทาง ${formatDuration(schedule.totals.travelMinutes)}`);
  }
  // Waiting is deliberately not here. It belongs to the stop it happens at,
  // where the list already shows it, and on a phone this line has only enough
  // room for the things that describe the day as a whole.

  const caveat = complete
    ? null
    : untimedLegs > 0
      ? 'เวลาเดินทางยังไม่ครบ'
      : 'เวลายังไม่ครบ';

  return { startLine, facts, caveat, crossesMidnight };
}
