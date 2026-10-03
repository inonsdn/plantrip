import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToastProvider } from '@/components/ui/toast';
import { SharePlanButton, posterFileName } from '@/components/itinerary/share-plan-button';
import { buildSharePlan, type SharePlanInput } from '@/lib/itinerary/share-plan';
import { POSTER_WIDTH, posterScale, renderSharePoster } from '@/lib/itinerary/share-poster';
import type { ItineraryDayView, ItineraryStopView } from '@/lib/itinerary/types';

/**
 * The poster is canvas, web fonts and object URLs. None of that exists in Node,
 * and every way it can fail — a blank bitmap, text measured against the wrong
 * face, a canvas the device refuses to allocate — only shows up once something
 * actually draws. These run against a real browser.
 */

const TRIP_ID = '11111111-1111-1111-1111-111111111111';
const BRAND = { red: 103, green: 80, blue: 196 };

function stop(id: string, name: string, extra: Partial<ItineraryStopView> = {}): ItineraryStopView {
  return {
    id,
    dayId: 'day-1',
    position: 0,
    placeProvider: 'manual',
    placeId: null,
    name,
    address: null,
    latitude: null,
    longitude: null,
    visitDurationMinutes: 30,
    arrivalLocalTime: null,
    departureLocalTime: null,
    enabled: true,
    notes: null,
    ...extra,
  };
}

function day(id: string, localDate: string, stops: ItineraryStopView[]): ItineraryDayView {
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
  };
}

function input(days: ItineraryDayView[]): SharePlanInput {
  return {
    tripName: 'Hokkaido',
    destination: 'Sapporo',
    startDate: '2026-12-04',
    endDate: '2026-12-12',
    memberCount: 2,
    days,
    travelByLegKey: {},
  };
}

const ONE_DAY = [
  day('day-1', '2026-12-04', [
    stop('a', 'Furano Cheese factory', { arrivalLocalTime: '10:00', departureLocalTime: '14:00' }),
    stop('b', 'Furano station'),
    stop('c', 'Sotetsu hotel', { enabled: false }),
  ]),
];

/** The PNG, decoded, so its pixels can be looked at. */
async function decode(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

function pixel(image: ImageData, x: number, y: number) {
  const offset = (y * image.width + x) * 4;
  return { red: image.data[offset], green: image.data[offset + 1], blue: image.data[offset + 2] };
}

/**
 * The share of sampled pixels that are darker than the page and the cards,
 * both of which are near-white. A canvas the device refused to draw comes back
 * fully transparent or fully white, so this is what tells the two apart.
 */
function inkRatio(image: ImageData): number {
  const stride = 4 * 97;
  let inked = 0;
  let sampled = 0;
  for (let offset = 0; offset < image.data.length; offset += stride) {
    sampled += 1;
    const [red, green, blue] = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    if (red < 240 || green < 240 || blue < 240) inked += 1;
  }
  return inked / sampled;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
});

async function mount(days: ItineraryDayView[]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <SharePlanButton input={input(days)} />
      </ToastProvider>,
    );
  });
  return container;
}

const button = (host: HTMLElement) =>
  [...host.querySelectorAll('button')].find((element) =>
    element.textContent?.includes('แชร์เป็นรูป'),
  )!;

async function settle() {
  // The click starts an async render; give the font wait, the draw and
  // toBlob a turn each before looking.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    if (document.querySelector('img[alt^="แผนการเดินทางของ"]')) return;
  }
}

describe('renderSharePoster', () => {
  it('draws a picture of the right width that is not blank', async () => {
    const image = await renderSharePoster(buildSharePlan(input(ONE_DAY)));

    // A trip this short is drawn at the sharpest scale.
    expect(image.width).toBe(POSTER_WIDTH * 2);
    expect(image.blob.type).toBe('image/png');
    expect(image.blob.size).toBeGreaterThan(1000);

    const decoded = await decode(image.blob);
    expect(inkRatio(decoded)).toBeGreaterThan(0.05);
  });

  it('paints the header in the brand colour', async () => {
    const image = await renderSharePoster(buildSharePlan(input(ONE_DAY)));
    const decoded = await decode(image.blob);
    expect(pixel(decoded, 20, 20)).toEqual(BRAND);
  });

  it('grows with the trip, so no day is quietly dropped', async () => {
    const short = await renderSharePoster(buildSharePlan(input(ONE_DAY)));
    const long = await renderSharePoster(
      buildSharePlan(
        input([
          ...ONE_DAY,
          day('day-2', '2026-12-05', [stop('d', 'Asahikawa'), stop('e', 'Biei')]),
          day('day-3', '2026-12-06', [stop('f', 'Otaru')]),
        ]),
      ),
    );
    expect(long.height).toBeGreaterThan(short.height);
  });

  it('keeps a long trip inside the canvas every device will allocate', async () => {
    const days = Array.from({ length: 30 }, (_, index) =>
      day(`day-${index}`, '2026-12-04', [
        stop(`${index}-a`, 'Furano Cheese factory'),
        stop(`${index}-b`, 'Sotetsu hotel'),
        stop(`${index}-c`, 'Nanda buffet'),
      ]),
    );
    const image = await renderSharePoster(buildSharePlan(input(days)));
    expect(image.width * image.height).toBeLessThanOrEqual(16_777_216);
    expect((await decode(image.blob)).data.length).toBeGreaterThan(0);
  });

  it('draws a Thai trip name without running it off the edge', async () => {
    const plan = buildSharePlan({
      ...input(ONE_DAY),
      tripName: 'ทริปฮอกไกโดหน้าหนาวกับเพื่อนสนิทสิบคนแบบยาวมากจนขึ้นบรรทัดใหม่',
    });
    const image = await renderSharePoster(plan);
    const decoded = await decode(image.blob);
    // The right-hand gutter of the header band stays the brand colour: text
    // that overflowed its box would have landed in it.
    expect(pixel(decoded, decoded.width - 10, 60)).toEqual(BRAND);
  });
});

describe('posterScale', () => {
  it('is sharpest on a short trip', () => {
    expect(posterScale(1200)).toBe(2);
  });

  it('never goes below full size', () => {
    expect(posterScale(1_000_000)).toBe(1);
  });

  it('keeps the canvas under the ceiling as the trip grows', () => {
    for (const height of [1000, 4000, 8000, 12_000]) {
      const scale = posterScale(height);
      expect(POSTER_WIDTH * scale * height * scale).toBeLessThanOrEqual(16_777_217);
    }
  });
});

describe('SharePlanButton', () => {
  it('shows the picture after a tap', async () => {
    const host = await mount(ONE_DAY);
    await act(async () => {
      button(host).click();
    });
    await settle();

    const image = document.querySelector<HTMLImageElement>('img[alt^="แผนการเดินทางของ"]');
    expect(image).not.toBeNull();
    await image!.decode();
    expect(image!.naturalWidth).toBeGreaterThan(0);
    expect(image!.naturalHeight).toBeGreaterThan(0);
  });

  it('offers saving and sharing beside the picture', async () => {
    const host = await mount(ONE_DAY);
    await act(async () => {
      button(host).click();
    });
    await settle();

    const labels = [...document.querySelectorAll('button')].map((element) => element.textContent);
    expect(labels).toContain('บันทึกรูป');
    expect(labels).toContain('แชร์');
  });

  it('stands down when the trip has no days to draw', async () => {
    const host = await mount([]);
    expect(button(host).disabled).toBe(true);
  });
});

describe('posterFileName', () => {
  it('keeps a Thai name readable', () => {
    expect(posterFileName('ทริป ฮอกไกโด')).toBe('tripmate-ทริป-ฮอกไกโด.png');
  });

  it('drops what a filesystem would choke on', () => {
    expect(posterFileName('Trip/2026: "Japan"')).toBe('tripmate-Trip2026-Japan.png');
  });

  it('still names a trip called nothing', () => {
    expect(posterFileName('   ')).toBe('tripmate-trip.png');
  });
});
