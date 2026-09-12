import { describe, expect, it } from 'vitest';
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  computeDaySchedule,
  formatClock,
  formatDistance,
  formatDuration,
  legKey,
  parseLocalTime,
  splitClock,
  type LegTravel,
  type ScheduleStopInput,
} from '@/lib/itinerary/schedule';

const NINE_AM = 9 * 60;

function stop(
  id: string,
  visitMinutes: number,
  extra: Partial<ScheduleStopInput> = {},
): ScheduleStopInput {
  return { id, visitMinutes, notBeforeMinutes: null, enabled: true, ...extra };
}

function travel(pairs: Array<[string, string, number | null, LegTravel['source']?]>) {
  const map: Record<string, LegTravel> = {};
  for (const [origin, destination, minutes, source] of pairs) {
    map[legKey(origin, destination)] = {
      minutes,
      source: source ?? (minutes === null ? 'unknown' : 'provider'),
    };
  }
  return map;
}

describe('sequential timing', () => {
  it('walks arrival, departure and travel through the day', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 60), stop('b', 30), stop('c', 45)],
      travelByLegKey: travel([
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });

    expect(schedule.stops.map((s) => [formatClock(s.arrivalMinutes), formatClock(s.departureMinutes)])).toEqual([
      ['09:00', '10:00'],
      ['10:20', '10:50'],
      ['11:05', '11:50'],
    ]);
    expect(formatClock(schedule.endMinutes)).toBe('11:50');
    expect(schedule.totals).toMatchObject({
      travelMinutes: 35,
      visitMinutes: 135,
      waitMinutes: 0,
      elapsedMinutes: 170,
      complete: true,
    });
  });

  it('handles a day with zero or one enabled stop', () => {
    const empty = computeDaySchedule({ startMinutes: NINE_AM, stops: [], travelByLegKey: {} });
    expect(empty.stops).toEqual([]);
    expect(empty.legs).toEqual([]);
    expect(empty.endMinutes).toBeNull();
    expect(empty.totals.complete).toBe(true);

    const single = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 90)],
      travelByLegKey: {},
    });
    expect(single.legs).toEqual([]);
    expect(formatClock(single.endMinutes)).toBe('10:30');
    expect(single.totals.elapsedMinutes).toBe(90);
  });

  it('crosses midnight without wrapping the clock', () => {
    const schedule = computeDaySchedule({
      startMinutes: 22 * 60,
      stops: [stop('a', 120), stop('b', 90)],
      travelByLegKey: travel([['a', 'b', 45]]),
    });

    expect(formatClock(schedule.stops[1].arrivalMinutes)).toBe('00:45 (+1)');
    expect(formatClock(schedule.endMinutes)).toBe('02:15 (+1)');
    expect(schedule.totals.elapsedMinutes).toBe(255);
    expect(splitClock(schedule.endMinutes!).dayOffset).toBe(1);
  });
});

describe('disabled stops', () => {
  it('routes A to C directly when B is disabled', () => {
    const stops = [stop('a', 60), stop('b', 30, { enabled: false }), stop('c', 45)];
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops,
      travelByLegKey: travel([['a', 'c', 50]]),
    });

    expect(schedule.stops.map((s) => s.stopId)).toEqual(['a', 'c']);
    expect(schedule.legs.map((l) => l.legKey)).toEqual([legKey('a', 'c')]);
    expect(formatClock(schedule.stops[1].arrivalMinutes)).toBe('10:50');
    // B's own visit time is excluded from the plan entirely.
    expect(schedule.totals.visitMinutes).toBe(105);
  });

  it('re-enabling B restores the original plan', () => {
    const withB = [stop('a', 60), stop('b', 30), stop('c', 45)];
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: withB,
      travelByLegKey: travel([
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });
    expect(schedule.stops.map((s) => s.stopId)).toEqual(['a', 'b', 'c']);
    expect(formatClock(schedule.endMinutes)).toBe('11:50');
  });
});

describe('unknown travel time', () => {
  it('never assumes zero and marks everything downstream incomplete', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 60), stop('b', 30), stop('c', 45)],
      travelByLegKey: travel([
        ['a', 'b', null],
        ['b', 'c', 15],
      ]),
    });

    expect(formatClock(schedule.stops[0].departureMinutes)).toBe('10:00');
    expect(schedule.stops[1].incomplete).toBe(true);
    expect(schedule.stops[1].arrivalMinutes).toBeNull();
    expect(schedule.stops[2].incomplete).toBe(true);
    expect(schedule.endMinutes).toBeNull();
    expect(schedule.totals.elapsedMinutes).toBeNull();
    expect(schedule.totals.complete).toBe(false);
  });

  it('accepts a manual duration as a real answer', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 60), stop('b', 30)],
      travelByLegKey: travel([['a', 'b', 25, 'manual']]),
    });

    expect(schedule.legs[0].source).toBe('manual');
    expect(formatClock(schedule.stops[1].arrivalMinutes)).toBe('10:25');
    expect(schedule.totals.complete).toBe(true);
  });

  it('treats a missing leg entry as unknown, not as zero', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 60), stop('b', 30)],
      travelByLegKey: {},
    });
    expect(schedule.legs[0].source).toBe('unknown');
    expect(schedule.stops[1].arrivalMinutes).toBeNull();
  });
});

describe('"ถึงไม่ก่อนเวลา"', () => {
  it('turns an early arrival into waiting and pushes the rest along', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [
        stop('a', 30),
        stop('b', 60, { notBeforeMinutes: 11 * 60 }),
        stop('c', 30),
      ],
      travelByLegKey: travel([
        ['a', 'b', 15],
        ['b', 'c', 10],
      ]),
    });

    // Arrives 09:45 but may not start before 11:00.
    expect(formatClock(schedule.stops[1].arrivalMinutes)).toBe('09:45');
    expect(schedule.stops[1].waitMinutes).toBe(75);
    expect(formatClock(schedule.stops[1].departureMinutes)).toBe('12:00');
    expect(formatClock(schedule.stops[2].arrivalMinutes)).toBe('12:10');
    expect(schedule.totals.waitMinutes).toBe(75);
  });

  it('adds no waiting when the constraint is already satisfied', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 60, { notBeforeMinutes: 9 * 60 })],
      travelByLegKey: travel([['a', 'b', 15]]),
    });
    expect(schedule.stops[1].waitMinutes).toBe(0);
  });
});

describe('mixed modes and provider waiting', () => {
  it('carries each leg its own mode and reports transit waiting separately', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('hotel', 0), stop('cafe', 45), stop('museum', 90), stop('dinner', 60)],
      travelByLegKey: {
        [legKey('hotel', 'cafe')]: { minutes: 12, source: 'provider' },
        [legKey('cafe', 'museum')]: { minutes: 34, source: 'provider', transitWaitMinutes: 7 },
        [legKey('museum', 'dinner')]: { minutes: 18, source: 'provider' },
      },
    });

    expect(schedule.totals.travelMinutes).toBe(64);
    // Provider waiting sits inside that 34 minutes, so it is reported apart
    // from the timeline rather than added to it.
    expect(schedule.totals.transitWaitMinutes).toBe(7);
    expect(schedule.totals.waitMinutes).toBe(0);
    expect(schedule.totals.elapsedMinutes).toBe(259);
  });
});

describe('formatting', () => {
  it('formats clocks and durations in Thai', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(null)).toBe('—');
    expect(formatDuration(45)).toBe('45 นาที');
    expect(formatDuration(60)).toBe('1 ชม.');
    expect(formatDuration(95)).toBe('1 ชม. 35 นาที');
    expect(formatDuration(null)).toBe('—');
  });

  it('parses stored local times', () => {
    expect(parseLocalTime('09:30')).toBe(570);
    expect(parseLocalTime('09:30:00')).toBe(570);
    expect(parseLocalTime('24:00')).toBeNull();
    expect(parseLocalTime(null)).toBeNull();
  });
});

describe('transport modes', () => {
  it('offers every way of getting there, each with Thai copy', () => {
    expect([...TRANSPORT_MODES]).toEqual([
      'walking',
      'driving',
      'taxi',
      'transit',
      'train',
      'flight',
      'ferry',
    ]);
    for (const mode of TRANSPORT_MODES) {
      expect(TRANSPORT_MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
  });

  it('formats distances in Thai units', () => {
    expect(formatDistance(800)).toBe('800 ม.');
    expect(formatDistance(1500)).toBe('1.5 กม.');
    expect(formatDistance(23400)).toBe('23 กม.');
    expect(formatDistance(null)).toBe('—');
  });
});

describe('an unspecified visit duration', () => {
  const stops: ScheduleStopInput[] = [
    { id: 'a', visitMinutes: 30, notBeforeMinutes: null, enabled: true },
    { id: 'b', visitMinutes: null, notBeforeMinutes: null, enabled: true },
    { id: 'c', visitMinutes: 45, notBeforeMinutes: null, enabled: true },
  ];
  const travel: Record<string, LegTravel> = {
    [legKey('a', 'b')]: { minutes: 20, source: 'manual' },
    [legKey('b', 'c')]: { minutes: 15, source: 'manual' },
  };

  it('still knows when you arrive there', () => {
    const schedule = computeDaySchedule({ startMinutes: NINE_AM, stops, travelByLegKey: travel });
    expect(formatClock(schedule.stops[1].arrivalMinutes)).toBe('09:50');
  });

  it('refuses to guess when you leave, or anything after that', () => {
    const schedule = computeDaySchedule({ startMinutes: NINE_AM, stops, travelByLegKey: travel });

    expect(schedule.stops[1].departureMinutes).toBeNull();
    expect(schedule.stops[2].arrivalMinutes).toBeNull();
    expect(schedule.endMinutes).toBeNull();
    expect(schedule.totals.elapsedMinutes).toBeNull();
    expect(schedule.totals.complete).toBe(false);
  });

  it('leaves it out of the visit total rather than counting it as zero', () => {
    const schedule = computeDaySchedule({ startMinutes: NINE_AM, stops, travelByLegKey: travel });
    expect(schedule.totals.visitMinutes).toBe(75);
    expect(schedule.stops[1].visitMinutes).toBeNull();
  });

  it('completes the day again once the duration is filled in', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: stops.map((stop) => (stop.id === 'b' ? { ...stop, visitMinutes: 60 } : stop)),
      travelByLegKey: travel,
    });

    expect(schedule.totals.complete).toBe(true);
    expect(formatClock(schedule.endMinutes)).toBe('11:50');
  });
});
