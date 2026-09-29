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
  visitMinutes: number | null,
  extra: Partial<ScheduleStopInput> = {},
): ScheduleStopInput {
  return {
    id,
    visitMinutes,
    arrivalMinutes: null,
    departureMinutes: null,
    enabled: true,
    ...extra,
  };
}

const at = (clock: string) => parseLocalTime(clock)!;

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


const byId = (schedule: ReturnType<typeof computeDaySchedule>) =>
  new Map(schedule.stops.map((entry) => [entry.stopId, entry]));

describe('what the plan can work out on its own', () => {
  it('walks the day forwards while every piece is there', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45), stop('c', 60)],
      travelByLegKey: travel([
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });

    const stops = byId(schedule);
    expect(formatClock(stops.get('a')!.arrivalMinutes)).toBe('09:00');
    expect(formatClock(stops.get('a')!.departureMinutes)).toBe('09:30');
    expect(formatClock(stops.get('b')!.arrivalMinutes)).toBe('09:50');
    expect(formatClock(stops.get('c')!.arrivalMinutes)).toBe('10:50');
    expect(schedule.totals.travelMinutes).toBe(35);
    expect(schedule.totals.hasWarning).toBe(false);
    expect(stops.get('c')!.arrivalSource).toBe('derived');
  });

  it('crosses midnight without wrapping the clock', () => {
    const schedule = computeDaySchedule({
      startMinutes: 22 * 60,
      stops: [stop('a', 120), stop('b', 90)],
      travelByLegKey: travel([['a', 'b', 60]]),
    });

    expect(formatClock(schedule.stops[1].arrivalMinutes)).toBe('01:00 (+1)');
    expect(splitClock(schedule.endMinutes!).dayOffset).toBe(1);
  });
});

describe('a gap stops at the gap', () => {
  it('leaves the time blank instead of spreading the gap down the list', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', null), stop('b', 45), stop('c', 60)],
      travelByLegKey: travel([
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });

    const stops = byId(schedule);
    // Nobody said how long to stay at A, so there is no departure. That is all
    // it means: no complaint, and nothing to say about it on every card below.
    expect(formatClock(stops.get('a')!.arrivalMinutes)).toBe('09:00');
    expect(stops.get('a')!.departureMinutes).toBeNull();
    expect(stops.get('b')!.arrivalMinutes).toBeNull();
    expect(schedule.totals.hasWarning).toBe(false);
    expect(schedule.stops.every((entry) => entry.warning === null)).toBe(true);
  });

  it('picks the day back up at the next place that says a time', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [
        stop('a', null),
        stop('b', 45, { arrivalMinutes: at('13:00') }),
        stop('c', 60),
      ],
      travelByLegKey: travel([
        ['a', 'b', null],
        ['b', 'c', 15],
      ]),
    });

    const stops = byId(schedule);
    expect(stops.get('a')!.departureMinutes).toBeNull();
    // B owes nothing to what came before it.
    expect(formatClock(stops.get('b')!.arrivalMinutes)).toBe('13:00');
    expect(stops.get('b')!.arrivalSource).toBe('stated');
    expect(formatClock(stops.get('b')!.departureMinutes)).toBe('13:45');
    // And the day runs on from there.
    expect(formatClock(stops.get('c')!.arrivalMinutes)).toBe('14:00');
    expect(schedule.totals.hasWarning).toBe(false);
  });

  it('never assumes a missing travel time is zero', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45)],
      travelByLegKey: travel([['a', 'b', null]]),
    });

    expect(formatClock(schedule.stops[0].departureMinutes)).toBe('09:30');
    expect(schedule.stops[1].arrivalMinutes).toBeNull();
    expect(schedule.totals.travelMinutes).toBe(0);
  });
});

describe('times written down by hand', () => {
  it('takes a departure as given, whatever the visit duration says', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30, { departureMinutes: at('11:00') }), stop('b', 45)],
      travelByLegKey: travel([['a', 'b', 20]]),
    });

    const stops = byId(schedule);
    expect(formatClock(stops.get('a')!.departureMinutes)).toBe('11:00');
    expect(stops.get('a')!.departureSource).toBe('stated');
    expect(formatClock(stops.get('b')!.arrivalMinutes)).toBe('11:20');
  });

  it('lets a place be timed with nothing but its own two times', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [
        stop('a', null),
        stop('b', null, { arrivalMinutes: at('14:00'), departureMinutes: at('16:30') }),
      ],
      travelByLegKey: travel([['a', 'b', null]]),
    });

    const entry = byId(schedule).get('b')!;
    expect(formatClock(entry.arrivalMinutes)).toBe('14:00');
    expect(formatClock(entry.departureMinutes)).toBe('16:30');
    expect(entry.warning).toBeNull();
  });

  it('counts getting there early as waiting', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45, { arrivalMinutes: at('11:00') })],
      travelByLegKey: travel([['a', 'b', 20]]),
    });

    const entry = byId(schedule).get('b')!;
    // Reached at 09:50, written down as 11:00.
    expect(entry.waitMinutes).toBe(70);
    expect(schedule.totals.waitMinutes).toBe(70);
    expect(formatClock(entry.departureMinutes)).toBe('11:45');
  });

  it('adds no waiting when the plan arrives after the time written down', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 120), stop('b', 45, { arrivalMinutes: at('10:00') })],
      travelByLegKey: travel([['a', 'b', 20]]),
    });

    const entry = byId(schedule).get('b')!;
    expect(entry.waitMinutes).toBe(0);
    // The time written down wins: it is a fact, not a floor.
    expect(formatClock(entry.arrivalMinutes)).toBe('10:00');
    expect(entry.warning).toEqual({ reason: 'arrival_before_previous_departure' });
  });
});

describe('a warning, and only when the clock runs backwards', () => {
  it('flags leaving before arriving', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', null, { arrivalMinutes: at('14:00'), departureMinutes: at('11:00') })],
      travelByLegKey: {},
    });

    expect(schedule.stops[0].warning).toEqual({ reason: 'departure_before_arrival' });
    expect(schedule.totals.hasWarning).toBe(true);
  });

  it('flags arriving before leaving the place before it', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [
        stop('a', null, { arrivalMinutes: at('09:00'), departureMinutes: at('15:00') }),
        stop('b', null, { arrivalMinutes: at('12:00') }),
      ],
      travelByLegKey: travel([['a', 'b', null]]),
    });

    expect(schedule.stops[0].warning).toBeNull();
    expect(schedule.stops[1].warning).toEqual({ reason: 'arrival_before_previous_departure' });
  });

  it('says nothing about a day that is merely unfinished', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', null), stop('b', null), stop('c', null)],
      travelByLegKey: {},
    });

    expect(schedule.stops.every((entry) => entry.warning === null)).toBe(true);
    expect(schedule.totals.hasWarning).toBe(false);
  });

  it('cannot be raised by a time the plan worked out itself', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45), stop('c', 60)],
      travelByLegKey: travel([
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });

    expect(schedule.totals.hasWarning).toBe(false);
  });
});

describe('disabled stops', () => {
  it('routes A to C directly when B is disabled, and back again when it returns', () => {
    const withB = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45, { enabled: false }), stop('c', 60)],
      travelByLegKey: travel([
        ['a', 'c', 50],
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });
    expect(withB.stops).toHaveLength(2);
    expect(formatClock(withB.stops[1].arrivalMinutes)).toBe('10:20');

    const restored = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45), stop('c', 60)],
      travelByLegKey: travel([
        ['a', 'c', 50],
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });
    expect(restored.stops).toHaveLength(3);
    expect(formatClock(restored.stops[2].arrivalMinutes)).toBe('10:50');
  });
});

describe('the day in total', () => {
  it('ends at the last time it knows, not at the last stop', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45), stop('c', null)],
      travelByLegKey: travel([
        ['a', 'b', 20],
        ['b', 'c', 15],
      ]),
    });

    // C has no duration, so no departure — the day is known up to arriving there.
    expect(formatClock(schedule.endMinutes)).toBe('10:50');
    expect(schedule.totals.elapsedMinutes).toBe(110);
  });

  it('leaves the visit total out rather than counting an unanswered stay as zero', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', null)],
      travelByLegKey: travel([['a', 'b', 20]]),
    });

    expect(schedule.totals.visitMinutes).toBe(30);
  });

  it('reports provider waiting separately from its own', () => {
    const schedule = computeDaySchedule({
      startMinutes: NINE_AM,
      stops: [stop('a', 30), stop('b', 45)],
      travelByLegKey: {
        [legKey('a', 'b')]: { minutes: 40, source: 'provider', transitWaitMinutes: 12 },
      },
    });

    expect(schedule.totals.transitWaitMinutes).toBe(12);
    expect(schedule.totals.travelMinutes).toBe(40);
  });
});
