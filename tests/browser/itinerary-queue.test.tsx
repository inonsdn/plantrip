import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ItineraryOperation } from '@/lib/itinerary/operations';

// The one seam: the queue's own dispatcher. Everything above it — the hook, the
// storage, the toast, React itself — is the real code running in a real browser.
const calls: Array<{
  operation: ItineraryOperation;
  expectedVersion: number | null;
  resolve: (value: unknown) => void;
}> = [];

vi.mock('@/components/itinerary/run-operation', () => ({
  runOperation: (_tripId: string, operation: ItineraryOperation, expectedVersion: number | null) =>
    new Promise((resolve) => calls.push({ operation, expectedVersion, resolve })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
}));

const { mount, cleanup, day, stop, DAY_ID } = await import('./harness');

const succeed = (index: number, version: number) =>
  act(async () => {
    calls[index].resolve({ ok: true, data: { version } });
    await Promise.resolve();
  });

const refuse = (index: number, error = 'มีคนแก้ไขแผนวันนี้ไปแล้ว') =>
  act(async () => {
    calls[index].resolve({ ok: false, error });
    await Promise.resolve();
  });

const reorder = (...stopIds: string[]): ItineraryOperation => ({
  kind: 'reorder',
  dayId: DAY_ID,
  stopIds,
});

const rename = (stopId: string, name: string): ItineraryOperation => ({
  kind: 'saveStop',
  dayId: DAY_ID,
  stopId,
  stop: {
    name,
    notes: null,
    visitDurationMinutes: 30,
    arrivalLocalTime: null,
    departureLocalTime: null,
    enabled: true,
  },
  leg: null,
});

beforeEach(() => {
  calls.length = 0;
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('editing twice in a row', () => {
  it('checks the second edit against the version the server just gave, not the page', async () => {
    const view = await mount([day(5, [stop('a'), stop('b')])]);

    act(() => view.api.submit(rename('a', 'first')));
    expect(calls).toHaveLength(1);
    expect(calls[0].expectedVersion).toBe(5);

    // The server took it and moved to 6. The page has NOT been revalidated yet,
    // so it still says 5 — which is the whole of "edit once, then never again".
    await succeed(0, 6);

    act(() => view.api.submit(rename('a', 'second')));
    expect(calls).toHaveLength(2);
    expect(calls[1].expectedVersion).toBe(6);

    await succeed(1, 7);
    act(() => view.api.submit(rename('a', 'third')));
    expect(calls[2].expectedVersion).toBe(7);
  });

  it('defers to the page when someone else has moved further ahead', async () => {
    const view = await mount([day(5, [stop('a')])]);
    act(() => view.api.submit(rename('a', 'mine')));
    await succeed(0, 6);

    // A co-traveller's edit arrives: the page is now at 9.
    await view.rerender([day(9, [stop('a')])]);

    act(() => view.api.submit(rename('a', 'next')));
    expect(calls[1].expectedVersion).toBe(9);
  });
});

describe('a refusal costs only the change that was refused', () => {
  it('rolls back the one that failed and sends the rest', async () => {
    const view = await mount([day(5, [stop('a', 'A'), stop('b', 'B'), stop('c', 'C')])]);

    act(() => {
      view.api.submit(rename('a', 'A ใหม่'));
      view.api.submit(rename('b', 'B ใหม่'));
      view.api.submit(rename('c', 'C ใหม่'));
    });

    // All three are drawn at once, before any of them has been sent.
    expect(view.stops()).toEqual(['A ใหม่', 'B ใหม่', 'C ใหม่']);
    expect(view.text('pending')).toBe('3');

    await succeed(0, 6);
    await refuse(1);

    // The middle one is gone from the screen. The other two are untouched, and
    // the third was still sent.
    expect(view.stops()).toEqual(['A ใหม่', 'B', 'C ใหม่']);
    expect(calls).toHaveLength(3);
    expect(calls[2].operation).toMatchObject({ stopId: 'c' });

    await succeed(2, 7);
    expect(view.text('pending')).toBe('0');
  });

  it('says so out loud every time, and never drops a change in silence', async () => {
    const view = await mount([day(5, [stop('a', 'A')])]);
    act(() => view.api.submit(rename('a', 'A ใหม่')));
    await refuse(0, 'เหตุผลจากเซิร์ฟเวอร์');

    expect(document.body.textContent).toContain('เหตุผลจากเซิร์ฟเวอร์');
    expect(document.body.textContent).toContain('ลองใหม่');
    expect(view.stops()).toEqual(['A']);
  });
});

describe('a save landing in the background', () => {
  it('does not take the keyboard away from what is being typed', async () => {
    const view = await mount([day(5, [stop('a', 'A')])]);

    const field = view.field();
    field.focus();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(field, 'กำลังพิมพ์อยู่');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.activeElement).toBe(field);

    act(() => view.api.submit(rename('a', 'A ใหม่')));
    await succeed(0, 6);

    // The save landed, the list re-rendered, and the caret never moved.
    expect(document.activeElement).toBe(view.field());
    expect(view.field().value).toBe('กำลังพิมพ์อยู่');
    expect(view.field().disabled).toBe(false);
  });
});

describe('an unsent change outlives the app', () => {
  it('is written down while it waits, and picked up on the way back', async () => {
    const view = await mount([day(5, [stop('a', 'A')])]);
    act(() => view.api.submit(rename('a', 'A ใหม่')));

    const written = window.localStorage.getItem(
      'tripmate:itinerary-queue:11111111-1111-1111-1111-111111111111',
    );
    expect(written).toBeTruthy();
    expect(JSON.parse(written!)).toHaveLength(1);

    // The tab goes away before the server ever answers.
    view.unmount();
    calls.length = 0;

    const reopened = await mount([day(5, [stop('a', 'A')])]);
    await act(async () => {
      await Promise.resolve();
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].operation).toMatchObject({ stopId: 'a' });
    // Nothing we remembered before the app closed says anything about now.
    expect(calls[0].expectedVersion).toBeNull();
    expect(reopened.stops()).toEqual(['A ใหม่']);
  });

  it('clears what it has written once the server has it', async () => {
    const view = await mount([day(5, [stop('a', 'A')])]);
    const key = 'tripmate:itinerary-queue:11111111-1111-1111-1111-111111111111';

    act(() => view.api.submit(rename('a', 'A ใหม่')));
    expect(window.localStorage.getItem(key)).toBeTruthy();

    await succeed(0, 6);
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(view.text('pending')).toBe('0');
  });
});

describe('the backstop', () => {
  it('leaves a person who hits a real conflict twice alone', async () => {
    const view = await mount([day(5, [stop('a', 'A')])]);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      act(() => view.api.submit(rename('a', `ครั้งที่ ${attempt}`)));
      await refuse(calls.length - 1);
    }

    expect(view.text('halted')).toBe('no');
    act(() => view.api.submit(rename('a', 'ยังส่งได้')));
    expect(calls).toHaveLength(4);
  });

  it('stops for good once refusals come back faster than anyone can edit', async () => {
    const view = await mount([day(5, [stop('a', 'A')])]);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      act(() => view.api.submit(rename('a', `ครั้งที่ ${attempt}`)));
      await refuse(calls.length - 1);
    }

    expect(view.text('halted')).toBe('yes');
    expect(document.body.textContent).toContain('โหลดหน้านี้ใหม่');

    const sentSoFar = calls.length;
    act(() => view.api.submit(rename('a', 'ต้องไม่ถูกส่ง')));

    // Nothing more reaches the server — and the person is told, rather than
    // watching the change disappear.
    expect(calls).toHaveLength(sentSoFar);
    expect(document.body.textContent).toContain('ไม่ถูกบันทึก');
  });
});

describe('ordering', () => {
  it('sends one change at a time, in the order they were made', async () => {
    const view = await mount([day(5, [stop('a', 'A'), stop('b', 'B')])]);

    act(() => {
      view.api.submit(reorder('b', 'a'));
      view.api.submit(rename('a', 'A ใหม่'));
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].operation.kind).toBe('reorder');

    await succeed(0, 6);
    expect(calls).toHaveLength(2);
    expect(calls[1].operation.kind).toBe('saveStop');
    expect(calls[1].expectedVersion).toBe(6);
    expect(view.stops()).toEqual(['B', 'A ใหม่']);
  });
});
