import { describe, expect, it } from 'vitest';
import { zonedLocalToIso } from '@/components/itinerary/use-routing';
import { computeDaySchedule, legKey } from '@/lib/itinerary/schedule';
import { resolveLegs, type StoredLegPreference } from '@/lib/itinerary/legs';

describe('zonedLocalToIso', () => {
  it('converts a Bangkok morning to the matching UTC instant', () => {
    // 09:30 in UTC+07:00.
    expect(zonedLocalToIso('2026-03-01', 9 * 60 + 30, 'Asia/Bangkok')).toBe(
      '2026-03-01T02:30:00.000Z',
    );
  });

  it('converts a Tokyo morning to the matching UTC instant', () => {
    // 09:30 in UTC+09:00.
    expect(zonedLocalToIso('2026-03-01', 9 * 60 + 30, 'Asia/Tokyo')).toBe(
      '2026-03-01T00:30:00.000Z',
    );
  });

  it('rolls minutes past midnight into the following day', () => {
    // 01:00 the next morning, Bangkok time.
    expect(zonedLocalToIso('2026-03-01', 25 * 60, 'Asia/Bangkok')).toBe(
      '2026-03-01T18:00:00.000Z',
    );
  });

  it('follows a zone across a daylight-saving change', () => {
    // New York moves to UTC-04:00 on 8 March 2026.
    expect(zonedLocalToIso('2026-03-07', 12 * 60, 'America/New_York')).toBe(
      '2026-03-07T17:00:00.000Z',
    );
    expect(zonedLocalToIso('2026-03-09', 12 * 60, 'America/New_York')).toBe(
      '2026-03-09T16:00:00.000Z',
    );
  });

  it('returns null rather than a wrong instant for an unusable zone', () => {
    expect(zonedLocalToIso('2026-03-01', 540, 'Not/AZone')).toBeNull();
    expect(zonedLocalToIso('not-a-date', 540, 'Asia/Bangkok')).toBeNull();
  });
});

describe('map visibility is not a planning decision', () => {
  const stops = [
    { id: 'a', enabled: true },
    { id: 'b', enabled: true },
    { id: 'c', enabled: true },
  ];

  function preferences(visibleOnMap: boolean): StoredLegPreference[] {
    return [
      {
        legKey: legKey('a', 'b'),
        originStopId: 'a',
        destinationStopId: 'b',
        transportMode: 'transit',
        selectedRouteReference: null,
        manualDurationMinutes: 20,
        visibleOnMap,
      },
      {
        legKey: legKey('b', 'c'),
        originStopId: 'b',
        destinationStopId: 'c',
        transportMode: 'walking',
        selectedRouteReference: null,
        manualDurationMinutes: 10,
        visibleOnMap: true,
      },
    ];
  }

  function scheduleFor(visibleOnMap: boolean) {
    const legs = resolveLegs(stops, preferences(visibleOnMap), 'transit');
    return computeDaySchedule({
      startMinutes: 9 * 60,
      stops: stops.map((stop) => ({
        id: stop.id,
        visitMinutes: 30,
        notBeforeMinutes: null,
        enabled: stop.enabled,
      })),
      travelByLegKey: Object.fromEntries(
        legs.map((leg) => [
          leg.legKey,
          { minutes: leg.manualDurationMinutes, source: 'manual' as const },
        ]),
      ),
    });
  }

  it('produces an identical timeline whether or not a leg is drawn on the map', () => {
    expect(scheduleFor(false)).toEqual(scheduleFor(true));
  });

  it('keeps the hidden leg in the plan with its own travel time', () => {
    const schedule = scheduleFor(false);
    expect(schedule.totals.travelMinutes).toBe(30);
    expect(schedule.totals.elapsedMinutes).toBe(120);
  });
});
