/**
 * The whole trip, flattened into the lines a shareable picture needs.
 *
 * This is the only place that decides *what* the picture says. It is plain data
 * and plain strings — no canvas, no DOM — so the wording and the arithmetic can
 * be tested without drawing anything, and the painter beside it never has to
 * know what a stop is.
 *
 * Times come from the same `computeDaySchedule` the screen uses, so a plan that
 * reads "ถึง 10:00" in the app cannot read anything else in the picture.
 */

import { formatDateRange, formatDateWithWeekday } from '@/lib/format';
import {
  computeDaySchedule,
  formatClock,
  formatDuration,
  parseLocalTime,
  type LegTravel,
} from './schedule';
import type { ItineraryDayView } from './types';

export interface SharePlanStop {
  /** 1-based among the stops that are actually in the plan. */
  order: number;
  name: string;
  /** `ถึง 10:00 · ออก 14:00` — em dash where a time could not be worked out. */
  times: string;
  /** `รอ 1 ชม.`, or null when the plan arrives exactly on time. */
  wait: string | null;
  /** `30 นาที`, or null when nobody said how long to stay. */
  visit: string | null;
  /** True while this stop's times run backwards. */
  warning: boolean;
}

export interface SharePlanDay {
  id: string;
  /** 1-based position in the trip, matching the tabs on screen. */
  index: number;
  /** `ศ. 4 ธ.ค.` */
  dateLabel: string;
  /** `เริ่ม 09:00` */
  startLabel: string;
  /** `รวม 10 ชม. 30 นาที · เที่ยว 2 ชม.`, or null when nothing is known yet. */
  totalsLabel: string | null;
  stops: SharePlanStop[];
}

export interface SharePlan {
  title: string;
  /** `Sapporo · 4 ธ.ค. – 12 ธ.ค. 2569 · 2 คน` */
  subtitle: string;
  days: SharePlanDay[];
  /** `9 วัน · 26 สถานที่` */
  footnote: string;
}

export interface SharePlanInput {
  tripName: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  memberCount: number;
  days: readonly ItineraryDayView[];
  /**
   * Travel times by leg, across every day. Legs with no answer may be left out
   * entirely — an unknown journey simply stops the clock rather than guessing.
   */
  travelByLegKey: Readonly<Record<string, LegTravel>>;
}

/** The fallback the planner uses when a day has no start time of its own. */
const DEFAULT_START_MINUTES = 9 * 60;

function joinParts(parts: Array<string | null>): string {
  return parts.filter((part): part is string => part !== null && part !== '').join(' · ');
}

function buildDay(
  day: ItineraryDayView,
  index: number,
  travelByLegKey: Readonly<Record<string, LegTravel>>,
): SharePlanDay {
  const startMinutes = parseLocalTime(day.startLocalTime) ?? DEFAULT_START_MINUTES;

  const schedule = computeDaySchedule({
    startMinutes,
    stops: day.stops.map((stop) => ({
      id: stop.id,
      visitMinutes: stop.visitDurationMinutes,
      arrivalMinutes: parseLocalTime(stop.arrivalLocalTime),
      departureMinutes: parseLocalTime(stop.departureLocalTime),
      enabled: stop.enabled,
    })),
    travelByLegKey,
  });

  const timingByStopId = new Map(schedule.stops.map((entry) => [entry.stopId, entry]));

  // A stop left out of the plan is left out of the picture: the point of
  // sharing is where everyone is actually going.
  const stops = day.stops
    .filter((stop) => stop.enabled)
    .map((stop, position) => {
      const timing = timingByStopId.get(stop.id);
      return {
        order: position + 1,
        name: stop.name,
        times: `ถึง ${formatClock(timing?.arrivalMinutes)} · ออก ${formatClock(
          timing?.departureMinutes,
        )}`,
        wait:
          timing && timing.waitMinutes > 0 ? `รอ ${formatDuration(timing.waitMinutes)}` : null,
        visit:
          stop.visitDurationMinutes === null ? null : formatDuration(stop.visitDurationMinutes),
        warning: Boolean(timing?.warning),
      } satisfies SharePlanStop;
    });

  const totals = joinParts([
    schedule.totals.elapsedMinutes === null
      ? null
      : `รวม ${formatDuration(schedule.totals.elapsedMinutes)}`,
    schedule.totals.travelMinutes > 0
      ? `เดินทาง ${formatDuration(schedule.totals.travelMinutes)}`
      : null,
    schedule.totals.visitMinutes > 0 ? `เที่ยว ${formatDuration(schedule.totals.visitMinutes)}` : null,
  ]);

  return {
    id: day.id,
    index,
    dateLabel: formatDateWithWeekday(day.localDate),
    startLabel: `เริ่ม ${formatClock(startMinutes)}`,
    totalsLabel: totals === '' ? null : totals,
    stops,
  };
}

export function buildSharePlan(input: SharePlanInput): SharePlan {
  const days = input.days.map((day, index) => buildDay(day, index + 1, input.travelByLegKey));
  const stopCount = days.reduce((total, day) => total + day.stops.length, 0);

  return {
    title: input.tripName,
    subtitle: joinParts([
      input.destination,
      formatDateRange(input.startDate, input.endDate),
      `${input.memberCount} คน`,
    ]),
    days,
    footnote: `${days.length} วัน · ${stopCount} สถานที่`,
  };
}
