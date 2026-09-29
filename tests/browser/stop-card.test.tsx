import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StopCard } from '@/components/itinerary/stop-card';
import { computeDaySchedule, parseLocalTime } from '@/lib/itinerary/schedule';
import type { ItineraryStopView } from '@/lib/itinerary/types';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

function view(id: string, name: string, visitDurationMinutes: number | null): ItineraryStopView {
  return {
    id,
    dayId: 'd',
    position: 0,
    placeProvider: 'manual',
    placeId: null,
    name,
    address: null,
    latitude: null,
    longitude: null,
    visitDurationMinutes,
    arrivalLocalTime: null,
    departureLocalTime: null,
    enabled: true,
    notes: null,
  };
}

const at = (clock: string) => parseLocalTime(clock)!;

async function renderDay(
  stops: Array<{
    id: string;
    name: string;
    visitMinutes: number | null;
    arrivalMinutes?: number | null;
    departureMinutes?: number | null;
  }>,
  travelByLegKey: Record<string, { minutes: number | null; source: 'manual' }> = {},
) {
  const schedule = computeDaySchedule({
    startMinutes: 8 * 60,
    stops: stops.map((entry) => ({
      id: entry.id,
      visitMinutes: entry.visitMinutes,
      arrivalMinutes: entry.arrivalMinutes ?? null,
      departureMinutes: entry.departureMinutes ?? null,
      enabled: true,
    })),
    travelByLegKey,
  });
  const timing = new Map(schedule.stops.map((entry) => [entry.stopId, entry]));

  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  await act(async () => {
    root!.render(
      <ol>
        {stops.map((entry, index) => (
          <StopCard
            key={entry.id}
            stop={view(entry.id, entry.name, entry.visitMinutes)}
            order={index + 1}
            timing={timing.get(entry.id)}
            onOpen={() => {}}
            onGripPointerDown={() => {}}
            registerElement={() => {}}
            dragging={false}
          />
        ))}
      </ol>,
    );
  });

  return {
    card: (id: string) => host!.querySelectorAll('li')[stops.findIndex((s) => s.id === id)],
    body: () => host!.textContent ?? '',
  };
}

describe('a card with nothing to say says nothing', () => {
  it('shows a dash instead of a sentence when the time cannot be worked out', async () => {
    const { body } = await renderDay([
      { id: 'a', name: 'Asahikawa', visitMinutes: null },
      { id: 'b', name: 'JR Inn', visitMinutes: null },
      { id: 'c', name: 'Biei station', visitMinutes: null },
    ]);

    // The whole point: no "ยังไม่ได้ระบุ…" repeated down the list.
    expect(body()).not.toContain('ยังไม่ได้ระบุ');
    expect(body()).not.toContain('ยังไม่รู้');
    expect(body()).not.toContain('คำนวณไม่ได้');
    expect(body()).toContain('ถึง 08:00 · ออก —');
    expect(body()).toContain('ถึง — · ออก —');
  });

  it('does not repeat the duration line when no duration was given', async () => {
    const { body } = await renderDay([{ id: 'a', name: 'Asahikawa', visitMinutes: null }]);
    expect(body()).not.toContain('ไม่ระบุเวลา');
  });

  it('shows the times it does know', async () => {
    const { body } = await renderDay(
      [
        { id: 'a', name: 'Asahikawa', visitMinutes: 60 },
        { id: 'b', name: 'JR Inn', visitMinutes: 30 },
      ],
      { 'a->b': { minutes: 15, source: 'manual' } },
    );

    expect(body()).toContain('ถึง 08:00 · ออก 09:00');
    expect(body()).toContain('ถึง 09:15 · ออก 09:45');
  });
});

describe('a time that runs backwards', () => {
  it('marks only the card it is on, and says why', async () => {
    const { card, body } = await renderDay([
      { id: 'a', name: 'Asahikawa', visitMinutes: null, arrivalMinutes: at('09:00'), departureMinutes: at('15:00') },
      { id: 'b', name: 'JR Inn', visitMinutes: null, arrivalMinutes: at('12:00') },
    ]);

    expect(card('a').className).not.toContain('border-negative');
    expect(card('b').className).toContain('border-negative');
    expect(body()).toContain('เวลาถึงอยู่ก่อนเวลาออกของจุดก่อนหน้า');
  });

  it('marks leaving before arriving', async () => {
    const { card, body } = await renderDay([
      { id: 'a', name: 'Asahikawa', visitMinutes: null, arrivalMinutes: at('14:00'), departureMinutes: at('11:00') },
    ]);

    expect(card('a').className).toContain('border-negative');
    expect(body()).toContain('เวลาออกอยู่ก่อนเวลาถึง');
  });

  it('leaves a merely unfinished day alone', async () => {
    const { card } = await renderDay([
      { id: 'a', name: 'Asahikawa', visitMinutes: null },
      { id: 'b', name: 'JR Inn', visitMinutes: null },
    ]);

    expect(card('a').className).not.toContain('border-negative');
    expect(card('b').className).not.toContain('border-negative');
  });
});
