import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StopRow, TravelRow } from '@/components/itinerary/stop-row';
import { computeDaySchedule, parseLocalTime } from '@/lib/itinerary/schedule';
import { stopTimeLines } from '@/lib/itinerary/timeline';
import type { ItineraryStopView } from '@/lib/itinerary/types';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

const at = (clock: string) => parseLocalTime(clock)!;

function view(
  id: string,
  name: string,
  extra: Partial<ItineraryStopView> = {},
): ItineraryStopView {
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
    visitDurationMinutes: null,
    arrivalLocalTime: null,
    departureLocalTime: null,
    enabled: true,
    notes: null,
    ...extra,
  };
}

interface Spec {
  id: string;
  name: string;
  visitMinutes?: number | null;
  arrivalMinutes?: number | null;
  departureMinutes?: number | null;
  notes?: string | null;
}

async function renderDay(
  specs: Spec[],
  travelByLegKey: Record<string, { minutes: number | null; source: 'manual' }> = {},
  onOpen: (id: string) => void = () => {},
  width = 390,
) {
  const schedule = computeDaySchedule({
    startMinutes: 8 * 60,
    stops: specs.map((spec) => ({
      id: spec.id,
      visitMinutes: spec.visitMinutes ?? null,
      arrivalMinutes: spec.arrivalMinutes ?? null,
      departureMinutes: spec.departureMinutes ?? null,
      enabled: true,
    })),
    travelByLegKey,
  });
  const timing = new Map(schedule.stops.map((entry) => [entry.stopId, entry]));
  const lines = stopTimeLines(schedule);

  host = document.createElement('div');
  host.style.width = `${width}px`;
  document.body.appendChild(host);
  root = createRoot(host);

  await act(async () => {
    root!.render(
      <ol>
        {specs.map((spec, index) => (
          <StopRow
            key={spec.id}
            stop={view(spec.id, spec.name, {
              visitDurationMinutes: spec.visitMinutes ?? null,
              notes: spec.notes ?? null,
            })}
            order={index + 1}
            timing={timing.get(spec.id)}
            line={lines.get(spec.id)}
            first={index === 0}
            last={index === specs.length - 1}
            onOpen={() => onOpen(spec.id)}
            onGripPointerDown={() => {}}
            registerElement={() => {}}
            dragging={false}
          />
        ))}
      </ol>,
    );
  });

  const items = () => [...host!.querySelectorAll('li')];
  return {
    items,
    row: (id: string) => items()[specs.findIndex((spec) => spec.id === id)],
    body: () => host!.textContent ?? '',
  };
}

describe('a row says what it knows and stops there', () => {
  it('never repeats an empty pair of times down the list', async () => {
    const { body } = await renderDay([
      { id: 'a', name: 'Asahikawa' },
      { id: 'b', name: 'JR Inn' },
      { id: 'c', name: 'Biei station' },
    ]);

    expect(body()).not.toContain('ถึง — · ออก —');
    expect(body()).not.toContain('ยังไม่ได้ระบุ');
    expect(body()).not.toContain('—');
  });

  it('explains the break once, then stays quiet', async () => {
    const { body } = await renderDay([
      { id: 'a', name: 'Asahikawa', visitMinutes: 60 },
      { id: 'b', name: 'JR Inn' },
      { id: 'c', name: 'Biei station' },
    ]);

    const text = body();
    expect(text).toContain('รอเวลาเดินทาง');
    expect(text.match(/รอเวลาเดินทาง/g)).toHaveLength(1);
  });

  it('shows a known span as a range', async () => {
    const { body } = await renderDay(
      [
        { id: 'a', name: 'Asahikawa', visitMinutes: 60 },
        { id: 'b', name: 'JR Inn', visitMinutes: 30 },
      ],
      { 'a->b': { minutes: 15, source: 'manual' } },
    );

    expect(body()).toContain('08:00 – 09:00');
    expect(body()).toContain('09:15 – 09:45');
  });

  it('shows a note when the stop has one', async () => {
    const { body } = await renderDay([
      { id: 'a', name: 'Asahikawa', notes: 'จองโต๊ะไว้แล้ว' },
    ]);
    expect(body()).toContain('จองโต๊ะไว้แล้ว');
  });
});

describe('a time that runs backwards', () => {
  it('marks only the row it is on, and says why', async () => {
    const { row, body } = await renderDay([
      { id: 'a', name: 'Asahikawa', arrivalMinutes: at('09:00'), departureMinutes: at('15:00') },
      { id: 'b', name: 'JR Inn', arrivalMinutes: at('12:00') },
    ]);

    expect(row('a').innerHTML).not.toContain('bg-negative-soft');
    expect(row('b').innerHTML).toContain('bg-negative-soft');
    expect(body()).toContain('เวลาถึงอยู่ก่อนเวลาออกของจุดก่อนหน้า');
  });

  it('leaves a merely unfinished day alone', async () => {
    const { row } = await renderDay([
      { id: 'a', name: 'Asahikawa' },
      { id: 'b', name: 'JR Inn' },
    ]);

    expect(row('a').innerHTML).not.toContain('bg-negative-soft');
    expect(row('b').innerHTML).not.toContain('bg-negative-soft');
  });
});

describe('tapping and dragging are different things', () => {
  it('opens the dialog from the body of the row', async () => {
    const onOpen = vi.fn();
    const { row } = await renderDay([{ id: 'a', name: 'Asahikawa' }], {}, onOpen);

    await act(async () => {
      row('a').querySelector('button')!.click();
    });
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('does not open the dialog when the grip is pressed', async () => {
    const onOpen = vi.fn();
    const grip = vi.fn();

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <ol>
          <StopRow
            stop={view('a', 'Asahikawa')}
            order={1}
            timing={undefined}
            line={{ kind: 'partial', text: 'ถึง 08:00' }}
            first
            last
            onOpen={onOpen}
            onGripPointerDown={grip}
            registerElement={() => {}}
            dragging={false}
          />
        </ol>,
      );
    });

    const buttons = [...host.querySelectorAll('button')];
    const handle = buttons.find((button) => button.textContent?.includes('ลากเพื่อจัดลำดับ'))!;

    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(grip).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('gives the grip the whole height of the row to aim at', async () => {
    // Narrow enough that the name wraps and the row is well over one line: a
    // grip that only sizes to its own icon would fall short of the row here.
    const { row } = await renderDay(
      [{ id: 'a', name: 'Asahiyama Zoo and Ice Museum', notes: 'จองตั๋วล่วงหน้า' }],
      {},
      () => {},
      320,
    );
    const element = row('a');
    const handle = [...element.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('ลากเพื่อจัดลำดับ'),
    )!;

    const height = handle.getBoundingClientRect().height;
    expect(height).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(element.getBoundingClientRect().height - 9);
  });
});

/** Where the text actually lands, which is not where its box is. */
function inkRight(element: Element): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().right;
}

describe('a name with no good place to break', () => {
  it('wraps instead of running past the grip', async () => {
    const { row } = await renderDay(
      // No spaces and no hyphens: every one of those would be a break the
      // browser takes on its own, and the rule under test would never show.
      [{ id: 'a', name: 'AsahiyamaZooAndIceMuseumObservationDeckEntranceGateNumberFour' }],
      {},
      () => {},
      320,
    );

    const element = row('a');
    const name = element.querySelector('span span')!;
    expect(inkRight(name)).toBeLessThanOrEqual(element.getBoundingClientRect().right + 1);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    );
  });

  it('lets a long Thai name wrap onto more than one line', async () => {
    const { row } = await renderDay(
      [
        {
          id: 'a',
          name: 'พิพิธภัณฑ์น้ำแข็งอาซาฮิกาวะและสวนสัตว์อาซาฮิยามะที่ชื่อยาวมากจนต้องตัดบรรทัด',
        },
      ],
      {},
      () => {},
      320,
    );

    const element = row('a');
    const name = element.querySelector('span span')!;
    const range = document.createRange();
    range.selectNodeContents(name);
    expect(range.getClientRects().length).toBeGreaterThan(1);
    expect(inkRight(name)).toBeLessThanOrEqual(element.getBoundingClientRect().right + 1);
  });
});

describe('TravelRow', () => {
  async function renderTravel(text: string, onOpen = () => {}) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <ol>
          <TravelRow
            travel={{ legKey: 'a->b', originStopId: 'a', mode: 'train', text }}
            originName="Asahikawa"
            onOpen={onOpen}
          />
        </ol>,
      );
    });
    return host.querySelector('button')!;
  }

  it('reads as one compact line', async () => {
    const button = await renderTravel('รถไฟ · 35 นาที');
    expect(button.textContent).toBe('รถไฟ · 35 นาที');
  });

  it('says what it edits, for anyone who cannot see the line it sits on', async () => {
    const button = await renderTravel('รถไฟ · 35 นาที');
    expect(button.getAttribute('aria-label')).toBe(
      'แก้ไขการเดินทางจาก Asahikawa: รถไฟ · 35 นาที',
    );
  });

  it('opens the editor for the stop it leaves', async () => {
    const onOpen = vi.fn();
    const button = await renderTravel('รถไฟ · 35 นาที', onOpen);
    await act(async () => {
      button.click();
    });
    expect(onOpen).toHaveBeenCalled();
  });
});
