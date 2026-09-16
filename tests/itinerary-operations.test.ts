import { describe, expect, it } from 'vitest';
import {
  applyOperation,
  checkedAgainstDay,
  describeOperation,
  versionsInvalidatedBy,
  type ItineraryOperation,
} from '@/lib/itinerary/operations';
import type { ItineraryDayView, ItineraryStopView } from '@/lib/itinerary/types';

function stop(id: string, dayId: string, position: number): ItineraryStopView {
  return {
    id,
    dayId,
    position,
    placeProvider: 'manual',
    placeId: null,
    name: id.toUpperCase(),
    address: null,
    latitude: null,
    longitude: null,
    visitDurationMinutes: 30,
    notBeforeLocalTime: null,
    enabled: true,
    notes: null,
  };
}

function days(): ItineraryDayView[] {
  return [
    {
      id: 'd1',
      tripId: 't',
      localDate: '2026-12-04',
      startLocalTime: '09:00',
      timeZone: 'Asia/Tokyo',
      defaultTransportMode: 'transit',
      version: 3,
      stops: [stop('a', 'd1', 0), stop('b', 'd1', 1)],
      legPreferences: [],
    },
    {
      id: 'd2',
      tripId: 't',
      localDate: '2026-12-05',
      startLocalTime: '08:00',
      timeZone: 'Asia/Tokyo',
      defaultTransportMode: 'walking',
      version: 1,
      stops: [],
      legPreferences: [],
    },
  ];
}

const names = (result: ItineraryDayView[], dayId: string) =>
  result.find((day) => day.id === dayId)?.stops.map((entry) => entry.id) ?? [];

describe('a change is data, so it can be replayed', () => {
  const cases: Array<[string, ItineraryOperation, (result: ItineraryDayView[]) => void]> = [
    [
      'reorder',
      { kind: 'reorder', dayId: 'd1', stopIds: ['b', 'a'] },
      (result) => expect(names(result, 'd1')).toEqual(['b', 'a']),
    ],
    [
      'addStop',
      { kind: 'addStop', dayId: 'd1', stop: stop('c', 'd1', 9) },
      (result) => expect(names(result, 'd1')).toEqual(['a', 'b', 'c']),
    ],
    [
      'saveStop',
      {
        kind: 'saveStop',
        dayId: 'd1',
        stopId: 'a',
        stop: {
          name: 'ใหม่',
          notes: null,
          visitDurationMinutes: 90,
          notBeforeLocalTime: null,
          enabled: false,
        },
        leg: null,
      },
      (result) => {
        const changed = result[0].stops[0];
        expect(changed.name).toBe('ใหม่');
        expect(changed.enabled).toBe(false);
      },
    ],
    [
      'saveDay',
      {
        kind: 'saveDay',
        dayId: 'd1',
        day: { startLocalTime: '07:00', timeZone: 'Asia/Bangkok', defaultTransportMode: 'driving' },
      },
      (result) => expect(result[0].startLocalTime).toBe('07:00'),
    ],
    [
      'deleteStop',
      { kind: 'deleteStop', stopId: 'a' },
      (result) => expect(names(result, 'd1')).toEqual(['b']),
    ],
    [
      'restoreStop',
      { kind: 'restoreStop', dayId: 'd2', stop: stop('z', 'd2', 0) },
      (result) => expect(names(result, 'd2')).toEqual(['z']),
    ],
    [
      'moveStop',
      { kind: 'moveStop', stopId: 'a', fromDayId: 'd1', toDayId: 'd2' },
      (result) => {
        expect(names(result, 'd1')).toEqual(['b']);
        expect(names(result, 'd2')).toEqual(['a']);
      },
    ],
  ];

  for (const [name, operation, check] of cases) {
    it(`applies ${name} on screen`, () => check(applyOperation(days(), operation)));

    it(`describes ${name} in words`, () => {
      expect(describeOperation(operation).trim().length).toBeGreaterThan(0);
    });

    it(`survives a round trip through storage as ${name}`, () => {
      const revived = JSON.parse(JSON.stringify(operation)) as ItineraryOperation;
      expect(revived).toEqual(operation);
      // The whole point of describing a change as data: replaying the revived
      // one has to land in exactly the same place as the original.
      expect(applyOperation(days(), revived)).toEqual(applyOperation(days(), operation));
    });
  }

  it('never mutates the days it was given', () => {
    const before = days();
    applyOperation(before, { kind: 'deleteStop', stopId: 'a' });
    expect(before).toEqual(days());
  });
});

describe('which day each change is checked against', () => {
  it('checks the day a single-day change belongs to', () => {
    expect(checkedAgainstDay({ kind: 'reorder', dayId: 'd1', stopIds: [] })).toBe('d1');
    expect(
      checkedAgainstDay({
        kind: 'saveDay',
        dayId: 'd1',
        day: { startLocalTime: '09:00', timeZone: 'UTC', defaultTransportMode: 'walking' },
      }),
    ).toBe('d1');
  });

  it('checks nothing for a change that is not about one day', () => {
    expect(checkedAgainstDay({ kind: 'deleteStop', stopId: 'a' })).toBeNull();
    expect(
      checkedAgainstDay({ kind: 'moveStop', stopId: 'a', fromDayId: 'd1', toDayId: 'd2' }),
    ).toBeNull();
  });

  it('forgets both versions a move touches', () => {
    expect(
      versionsInvalidatedBy({ kind: 'moveStop', stopId: 'a', fromDayId: 'd1', toDayId: 'd2' }),
    ).toEqual(['d1', 'd2']);
    expect(versionsInvalidatedBy({ kind: 'deleteStop', stopId: 'a' })).toEqual([]);
  });
});
