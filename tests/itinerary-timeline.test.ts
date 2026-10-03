import { describe, expect, it } from 'vitest';
import { resolveLegs, type StoredLegPreference } from '@/lib/itinerary/legs';
import {
  computeDaySchedule,
  legKey,
  parseLocalTime,
  type LegTravel,
  type ScheduleStopInput,
} from '@/lib/itinerary/schedule';
import { describeDay, stopTimeLines, travelLines } from '@/lib/itinerary/timeline';

const at = (clock: string) => parseLocalTime(clock)!;
const NINE = at('09:00');

function stop(id: string, extra: Partial<ScheduleStopInput> = {}): ScheduleStopInput {
  return {
    id,
    visitMinutes: null,
    arrivalMinutes: null,
    departureMinutes: null,
    enabled: true,
    ...extra,
  };
}

function schedule(
  stops: ScheduleStopInput[],
  travel: Record<string, LegTravel> = {},
  startMinutes = NINE,
) {
  return computeDaySchedule({ startMinutes, stops, travelByLegKey: travel });
}

const manual = (minutes: number): LegTravel => ({ minutes, source: 'manual' });

function preference(
  origin: string,
  destination: string,
  extra: Partial<StoredLegPreference> = {},
): StoredLegPreference {
  return {
    legKey: legKey(origin, destination),
    originStopId: origin,
    destinationStopId: destination,
    transportMode: 'train',
    selectedRouteReference: null,
    manualDurationMinutes: null,
    visibleOnMap: true,
    notes: null,
    ...extra,
  };
}

describe('stopTimeLines', () => {
  it('shows both ends as a range', () => {
    const lines = stopTimeLines(
      schedule([stop('a', { arrivalMinutes: at('10:00'), departureMinutes: at('14:00') })]),
    );
    expect(lines.get('a')).toEqual({ kind: 'range', text: '10:00 – 14:00' });
  });

  it('shows the one end it has', () => {
    const lines = stopTimeLines(schedule([stop('a')]));
    expect(lines.get('a')).toEqual({ kind: 'partial', text: 'ถึง 09:00' });
  });

  it('says what the clock is waiting for when a journey has no time', () => {
    const lines = stopTimeLines(schedule([stop('a', { visitMinutes: 60 }), stop('b')]));
    // a leaves at 10:00; nothing says how long it takes to reach b.
    expect(lines.get('b')).toEqual({ kind: 'blocked', text: 'รอเวลาเดินทาง' });
  });

  it('points at the stop above when that is what is missing', () => {
    const lines = stopTimeLines(schedule([stop('a'), stop('b')], { [legKey('a', 'b')]: manual(15) }));
    // a has no departure at all, so the journey's time cannot help.
    expect(lines.get('b')).toEqual({ kind: 'blocked', text: 'รอเวลาของจุดก่อนหน้า' });
  });

  it('explains a run of unknowable rows exactly once', () => {
    const lines = stopTimeLines(schedule([stop('a'), stop('b'), stop('c'), stop('d')]));
    expect(lines.get('a')?.kind).toBe('partial');
    expect(lines.get('b')?.kind).toBe('blocked');
    expect(lines.get('c')).toEqual({ kind: 'silent' });
    expect(lines.get('d')).toEqual({ kind: 'silent' });
  });

  it('explains itself again after the clock picks back up', () => {
    const lines = stopTimeLines(
      schedule([stop('a'), stop('b'), stop('c', { arrivalMinutes: at('13:00') }), stop('d')]),
    );
    expect(lines.get('b')?.kind).toBe('blocked');
    expect(lines.get('c')?.kind).toBe('partial');
    expect(lines.get('d')?.kind).toBe('blocked');
  });

  it('has nothing to say about a stop that is not in the plan', () => {
    const lines = stopTimeLines(schedule([stop('a'), stop('b', { enabled: false })]));
    expect(lines.has('b')).toBe(false);
  });
});

describe('travelLines', () => {
  const stops = [
    { id: 'a', enabled: true },
    { id: 'b', enabled: true },
  ];

  it('draws a journey somebody timed', () => {
    const legs = resolveLegs(stops, [preference('a', 'b', { manualDurationMinutes: 35 })], 'transit');
    const lines = travelLines(
      schedule([stop('a', { visitMinutes: 30 }), stop('b')], { [legKey('a', 'b')]: manual(35) }),
      legs,
    );
    expect(lines.get('b')?.text).toBe('รถไฟ · 35 นาที');
    expect(lines.get('b')?.originStopId).toBe('a');
  });

  it('keeps a journey somebody said takes no time at all', () => {
    const legs = resolveLegs(stops, [preference('a', 'b', { manualDurationMinutes: 0 })], 'transit');
    const lines = travelLines(
      schedule([stop('a', { visitMinutes: 30 }), stop('b')], { [legKey('a', 'b')]: manual(0) }),
      legs,
    );
    // Zero is an answer. It is only "0 นาที" because a person typed a zero.
    expect(lines.get('b')?.text).toBe('รถไฟ · 0 นาที');
  });

  it('never turns an unanswered journey into zero minutes', () => {
    const legs = resolveLegs(stops, [preference('a', 'b')], 'transit');
    const lines = travelLines(schedule([stop('a'), stop('b')]), legs);
    expect(lines.get('b')?.text).toBe('รถไฟ');
    expect(lines.get('b')?.text).not.toContain('0 นาที');
  });

  it('draws nothing for a pair nobody has touched', () => {
    const legs = resolveLegs(stops, [], 'transit');
    const lines = travelLines(schedule([stop('a'), stop('b')]), legs);
    expect(lines.size).toBe(0);
  });

  it('names the mode that was chosen, not the day default', () => {
    const legs = resolveLegs(stops, [preference('a', 'b', { transportMode: 'ferry' })], 'walking');
    const lines = travelLines(schedule([stop('a'), stop('b')]), legs);
    expect(lines.get('b')?.mode).toBe('ferry');
    expect(lines.get('b')?.text).toBe('เรือ');
  });
});

describe('describeDay', () => {
  it('leads with the start and a readable zone', () => {
    const summary = describeDay(schedule([stop('a')]), 'เวลาญี่ปุ่น');
    expect(summary.startLine).toBe('เริ่ม 09:00 · เวลาญี่ปุ่น');
  });

  it('gives an end and a total only once the whole day is timed', () => {
    const summary = describeDay(
      schedule(
        [
          stop('a', { arrivalMinutes: at('09:00'), departureMinutes: at('11:00'), visitMinutes: 120 }),
          stop('b', { arrivalMinutes: at('11:30'), departureMinutes: at('13:00') }),
        ],
        { [legKey('a', 'b')]: manual(30) },
      ),
      'เวลาญี่ปุ่น',
    );
    expect(summary.caveat).toBeNull();
    expect(summary.facts).toContain('จบ 13:00');
    expect(summary.facts).toContain('รวม 4 ชม.');
  });

  it('refuses to present half a day as a total', () => {
    const summary = describeDay(
      schedule([stop('a', { visitMinutes: 300 }), stop('b')]),
      'เวลาญี่ปุ่น',
    );
    // a runs 09:00–14:00 and the clock stops there. "รวม 5 ชม." would read as
    // the whole day rather than the part of it that is known.
    expect(summary.facts.some((fact) => fact.startsWith('รวม'))).toBe(false);
    expect(summary.facts.some((fact) => fact.startsWith('จบ'))).toBe(false);
    expect(summary.facts).toContain('เที่ยว 5 ชม.');
    expect(summary.caveat).toBe('เวลาเดินทางยังไม่ครบ');
  });

  it('blames the stops when it is the stops that are missing', () => {
    const summary = describeDay(
      schedule([stop('a'), stop('b')], { [legKey('a', 'b')]: manual(20) }),
      'เวลาญี่ปุ่น',
    );
    expect(summary.caveat).toBe('เวลายังไม่ครบ');
  });

  it('says the day is empty rather than totalling nothing', () => {
    const summary = describeDay(schedule([]), 'เวลาไทย');
    expect(summary.facts).toEqual([]);
    expect(summary.caveat).toBe('ยังไม่มีสถานที่ในวันนี้');
  });

  it('flags a day that runs past midnight', () => {
    const summary = describeDay(
      schedule([stop('a', { arrivalMinutes: at('22:00'), visitMinutes: 240 })], {}, at('21:00')),
      'เวลาญี่ปุ่น',
    );
    expect(summary.crossesMidnight).toBe(true);
  });

  it('leaves a day that ends before midnight unflagged', () => {
    const summary = describeDay(
      schedule([stop('a', { arrivalMinutes: at('18:00'), visitMinutes: 60 })]),
      'เวลาญี่ปุ่น',
    );
    expect(summary.crossesMidnight).toBe(false);
  });

  it('leaves waiting to the stop it happens at', () => {
    const summary = describeDay(
      schedule([stop('a', { arrivalMinutes: at('10:30') })]),
      'เวลาญี่ปุ่น',
    );
    // The row already says "รอ 1 ชม. 30 นาที"; the day line has room only for
    // what describes the whole day.
    expect(summary.facts.some((fact) => fact.startsWith('รอ'))).toBe(false);
  });
});
