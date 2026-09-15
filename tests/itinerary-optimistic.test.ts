import { describe, expect, it } from 'vitest';
import {
  insertStop,
  moveStopToDay,
  removeStop,
  reorderStops,
  updateDay,
  updateStop,
} from '@/lib/itinerary/optimistic';
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
      stops: [stop('a', 'd1', 0), stop('b', 'd1', 1), stop('c', 'd1', 2)],
      legPreferences: [
        {
          id: 'l1',
          dayId: 'd1',
          originStopId: 'a',
          destinationStopId: 'b',
          transportMode: 'walking',
          selectedRouteReference: null,
          manualDurationMinutes: 10,
          visibleOnMap: true,
          notes: null,
        },
      ],
    },
    {
      id: 'd2',
      tripId: 't',
      localDate: '2026-12-05',
      startLocalTime: '08:00',
      timeZone: 'Asia/Tokyo',
      defaultTransportMode: 'walking',
      version: 1,
      stops: [stop('z', 'd2', 0)],
      legPreferences: [],
    },
  ];
}

const ids = (result: ItineraryDayView[], dayId: string) =>
  result.find((day) => day.id === dayId)!.stops.map((s) => s.id);

describe('reorderStops', () => {
  it('puts the stops in the given order and renumbers them', () => {
    const result = reorderStops(days(), 'd1', ['c', 'a', 'b']);
    expect(ids(result, 'd1')).toEqual(['c', 'a', 'b']);
    expect(result[0].stops.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('never drops a stop the caller forgot to mention', () => {
    const result = reorderStops(days(), 'd1', ['c', 'a']);
    expect(ids(result, 'd1')).toEqual(['c', 'a', 'b']);
  });

  it('leaves other days alone and does not mutate the input', () => {
    const original = days();
    const result = reorderStops(original, 'd1', ['c', 'b', 'a']);
    expect(ids(result, 'd2')).toEqual(['z']);
    expect(original[0].stops.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('removeStop', () => {
  it('removes the stop, renumbers, and drops legs that touched it', () => {
    const result = removeStop(days(), 'b');
    expect(ids(result, 'd1')).toEqual(['a', 'c']);
    expect(result[0].stops.map((s) => s.position)).toEqual([0, 1]);
    expect(result[0].legPreferences).toEqual([]);
  });

  it('keeps legs that did not touch the removed stop', () => {
    const result = removeStop(days(), 'c');
    expect(result[0].legPreferences).toHaveLength(1);
  });
});

describe('insertStop', () => {
  it('appends to the end of the named day', () => {
    const result = insertStop(days(), 'd1', stop('new', 'd1', 99));
    expect(ids(result, 'd1')).toEqual(['a', 'b', 'c', 'new']);
    expect(result[0].stops.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });
});

describe('moveStopToDay', () => {
  it('takes the stop out of one day and puts it at the end of the other', () => {
    const result = moveStopToDay(days(), 'a', 'd2');
    expect(ids(result, 'd1')).toEqual(['b', 'c']);
    expect(ids(result, 'd2')).toEqual(['z', 'a']);
    expect(result.find((d) => d.id === 'd2')!.stops.at(-1)!.dayId).toBe('d2');
  });

  it('drops the legs the moved stop was part of', () => {
    expect(moveStopToDay(days(), 'a', 'd2')[0].legPreferences).toEqual([]);
  });

  it('does nothing when the stop is already on that day', () => {
    expect(ids(moveStopToDay(days(), 'a', 'd1'), 'd1')).toEqual(['a', 'b', 'c']);
  });
});

describe('updateDay', () => {
  it('applies the draft and leaves every other day alone', () => {
    const next = updateDay(days(), 'd1', {
      startLocalTime: '07:30',
      timeZone: 'Asia/Bangkok',
      defaultTransportMode: 'driving',
    });

    expect(next[0].startLocalTime).toBe('07:30');
    expect(next[0].timeZone).toBe('Asia/Bangkok');
    expect(next[0].defaultTransportMode).toBe('driving');
    expect(next[0].stops).toEqual(days()[0].stops);
    expect(next[1]).toEqual(days()[1]);
  });
});

describe('updateStop', () => {
  const draft = {
    name: 'A ใหม่',
    notes: 'โน้ต',
    visitDurationMinutes: 90,
    notBeforeLocalTime: '10:00',
    enabled: false,
  };

  it('edits the stop in place without touching its neighbours', () => {
    const next = updateStop(days(), 'a', draft, null);
    const day = next[0];

    expect(day.stops[0]).toMatchObject({ id: 'a', ...draft });
    expect(day.stops.slice(1)).toEqual(days()[0].stops.slice(1));
    expect(day.legPreferences).toEqual(days()[0].legPreferences);
  });

  it('updates the existing preference for that exact pair', () => {
    const next = updateStop(days(), 'a', draft, {
      destinationStopId: 'b',
      transportMode: 'train',
      manualDurationMinutes: 25,
      notes: 'ขึ้นรถไฟ',
    });

    expect(next[0].legPreferences).toHaveLength(1);
    expect(next[0].legPreferences[0]).toMatchObject({
      id: 'l1',
      originStopId: 'a',
      destinationStopId: 'b',
      transportMode: 'train',
      manualDurationMinutes: 25,
      notes: 'ขึ้นรถไฟ',
    });
  });

  it('adds a preference when the pair has none, leaving the others intact', () => {
    const next = updateStop(days(), 'b', draft, {
      destinationStopId: 'c',
      transportMode: 'walking',
      manualDurationMinutes: 5,
      notes: null,
    });

    expect(next[0].legPreferences).toHaveLength(2);
    // The a->b preference is untouched.
    expect(next[0].legPreferences[0]).toEqual(days()[0].legPreferences[0]);
    expect(next[0].legPreferences[1]).toMatchObject({
      originStopId: 'b',
      destinationStopId: 'c',
      transportMode: 'walking',
      manualDurationMinutes: 5,
    });
  });

  it('ignores a stop it cannot find', () => {
    expect(updateStop(days(), 'nope', draft, null)).toEqual(days());
  });
});
