import { describe, expect, it } from 'vitest';
import { buildSharePlan } from '@/lib/itinerary/share-plan';
import { legKey, type LegTravel } from '@/lib/itinerary/schedule';
import type { ItineraryDayView, ItineraryStopView } from '@/lib/itinerary/types';

const TRIP_ID = '11111111-1111-1111-1111-111111111111';

function stop(id: string, extra: Partial<ItineraryStopView> = {}): ItineraryStopView {
  return {
    id,
    dayId: 'day-1',
    position: 0,
    placeProvider: 'manual',
    placeId: null,
    name: id,
    address: null,
    latitude: null,
    longitude: null,
    visitDurationMinutes: null,
    arrivalLocalTime: null,
    departureLocalTime: null,
    enabled: true,
    notes: null,
    ...extra,
  };
}

function day(
  id: string,
  localDate: string,
  stops: ItineraryStopView[],
  extra: Partial<ItineraryDayView> = {},
): ItineraryDayView {
  return {
    id,
    tripId: TRIP_ID,
    localDate,
    startLocalTime: '09:00',
    timeZone: 'Asia/Tokyo',
    defaultTransportMode: 'transit',
    version: 1,
    stops,
    legPreferences: [],
    ...extra,
  };
}

function plan(days: ItineraryDayView[], travel: Record<string, LegTravel> = {}) {
  return buildSharePlan({
    tripName: 'Hokkaido',
    destination: 'Sapporo',
    startDate: '2026-12-04',
    endDate: '2026-12-12',
    memberCount: 2,
    days,
    travelByLegKey: travel,
  });
}

describe('buildSharePlan', () => {
  it('heads the picture with the trip, where it is and who is going', () => {
    const result = plan([day('day-1', '2026-12-04', [])]);
    expect(result.title).toBe('Hokkaido');
    expect(result.subtitle).toBe('Sapporo · 4 ธ.ค. – 12 ธ.ค. 2569 · 2 คน');
  });

  it('numbers the days the way the tabs on screen do', () => {
    const result = plan([
      day('day-1', '2026-12-04', []),
      day('day-2', '2026-12-05', []),
      day('day-3', '2026-12-06', []),
    ]);
    expect(result.days.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(result.days.map((entry) => entry.dateLabel)).toEqual(['ศ. 4 ธ.ค.', 'ส. 5 ธ.ค.', 'อา. 6 ธ.ค.']);
  });

  it('keeps a day with nothing in it, so the trip reads as a whole', () => {
    const result = plan([day('day-1', '2026-12-04', [])]);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].stops).toEqual([]);
    expect(result.footnote).toBe('1 วัน · 0 สถานที่');
  });

  it('writes the times the schedule works out', () => {
    const result = plan([
      day('day-1', '2026-12-04', [
        stop('a', { arrivalLocalTime: '10:00', departureLocalTime: '14:00' }),
        stop('b', { visitDurationMinutes: 30 }),
      ]),
    ]);

    expect(result.days[0].stops[0].times).toBe('ถึง 10:00 · ออก 14:00');
    // Nobody has said how long the journey from a to b takes, so b has no time
    // at all — the picture leaves it blank rather than pretending it is 14:00.
    expect(result.days[0].stops[1].times).toBe('ถึง — · ออก —');
  });

  it('carries travel times through, so a time can be worked out at all', () => {
    const travel = { [legKey('a', 'b')]: { minutes: 20, source: 'manual' as const } };
    const result = plan(
      [
        day('day-1', '2026-12-04', [
          stop('a', { arrivalLocalTime: '10:00', departureLocalTime: '11:00' }),
          stop('b', { visitDurationMinutes: 45 }),
        ]),
      ],
      travel,
    );
    expect(result.days[0].stops[1].times).toBe('ถึง 11:20 · ออก 12:05');
  });

  it('shows the gap before a stated arrival as waiting', () => {
    const result = plan([
      day('day-1', '2026-12-04', [stop('a', { arrivalLocalTime: '10:00' })]),
    ]);
    expect(result.days[0].stops[0].wait).toBe('รอ 1 ชม.');
  });

  it('says nothing about waiting when the plan arrives on time', () => {
    const result = plan([
      day('day-1', '2026-12-04', [stop('a', { arrivalLocalTime: '09:00' })]),
    ]);
    expect(result.days[0].stops[0].wait).toBeNull();
  });

  it('leaves out a stop that is not in the plan, and renumbers what is left', () => {
    const result = plan([
      day('day-1', '2026-12-04', [
        stop('a'),
        stop('b', { enabled: false }),
        stop('c'),
      ]),
    ]);
    expect(result.days[0].stops.map((entry) => entry.name)).toEqual(['a', 'c']);
    expect(result.days[0].stops.map((entry) => entry.order)).toEqual([1, 2]);
    expect(result.footnote).toBe('1 วัน · 2 สถานที่');
  });

  it('flags times that run backwards', () => {
    const result = plan([
      day('day-1', '2026-12-04', [
        stop('a', { arrivalLocalTime: '14:00', departureLocalTime: '10:00' }),
      ]),
    ]);
    expect(result.days[0].stops[0].warning).toBe(true);
  });

  it('leaves a sound day unflagged', () => {
    const result = plan([
      day('day-1', '2026-12-04', [
        stop('a', { arrivalLocalTime: '10:00', departureLocalTime: '14:00' }),
      ]),
    ]);
    expect(result.days[0].stops[0].warning).toBe(false);
  });

  it('writes how long a stay lasts, and nothing when nobody said', () => {
    const result = plan([
      day('day-1', '2026-12-04', [stop('a', { visitDurationMinutes: 90 }), stop('b')]),
    ]);
    expect(result.days[0].stops[0].visit).toBe('1 ชม. 30 นาที');
    expect(result.days[0].stops[1].visit).toBeNull();
  });

  it('totals a day that can be worked out', () => {
    const result = plan([
      day('day-1', '2026-12-04', [
        stop('a', { arrivalLocalTime: '10:00', departureLocalTime: '14:00', visitDurationMinutes: 60 }),
      ]),
    ]);
    expect(result.days[0].totalsLabel).toBe('รวม 5 ชม. · เที่ยว 1 ชม.');
  });

  it('leaves the totals off a day that reaches no known time', () => {
    const result = plan([day('day-1', '2026-12-04', [])]);
    expect(result.days[0].totalsLabel).toBeNull();
  });

  it('starts each day where that day starts', () => {
    const result = plan([
      day('day-1', '2026-12-04', [], { startLocalTime: '07:30' }),
      day('day-2', '2026-12-05', [], { startLocalTime: '11:00' }),
    ]);
    expect(result.days.map((entry) => entry.startLabel)).toEqual(['เริ่ม 07:30', 'เริ่ม 11:00']);
  });

  it('counts every stop across the whole trip', () => {
    const result = plan([
      day('day-1', '2026-12-04', [stop('a'), stop('b')]),
      day('day-2', '2026-12-05', [stop('c')]),
    ]);
    expect(result.footnote).toBe('2 วัน · 3 สถานที่');
  });
});
