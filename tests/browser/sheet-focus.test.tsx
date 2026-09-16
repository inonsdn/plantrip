import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Sheet } from '@/components/ui/sheet';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

/**
 * The dialog every itinerary edit happens in.
 *
 * `onClose` is an inline arrow at every call site, so it is a new function on
 * every render of whatever owns the sheet. While the focus effect depended on
 * it, any background render tore the effect down — and its cleanup puts focus
 * back on whatever opened the sheet. On a phone that closes the keyboard: a
 * queued save landing was enough to interrupt a sentence.
 */
function Owner({ onReady }: { onReady: (rerender: () => void) => void }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  onReady(() => setTick((value) => value + 1));

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="แก้ไขสถานที่">
      <input data-testid="name" defaultValue="" />
    </Sheet>
  );
}

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  let rerender!: () => void;
  await act(async () => {
    root!.render(<Owner onReady={(fn) => (rerender = fn)} />);
  });

  const field = document.querySelector('[data-testid="name"]') as HTMLInputElement;
  return { field, rerender: async () => act(async () => rerender()) };
}

describe('the sheet takes focus when it opens, and at no other time', () => {
  it('keeps the caret where it is when the owner re-renders', async () => {
    const { field, rerender } = await mount();

    field.focus();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    act(() => {
      setter.call(field, 'กำลังพิมพ์');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.activeElement).toBe(field);

    // A background save lands: nothing about the sheet changed, but its owner
    // renders again and hands it a brand new onClose.
    await rerender();

    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('กำลังพิมพ์');
  });

  it('still survives a burst of them', async () => {
    const { field, rerender } = await mount();
    field.focus();

    for (let index = 0; index < 5; index += 1) await rerender();

    expect(document.activeElement).toBe(field);
  });

  it('does move focus into the dialog when it opens', async () => {
    await mount();
    const panel = document.querySelector('[role="dialog"]')!;
    // The first focusable thing in the panel, which is the close button in the
    // header — a field further down can claim it with [data-autofocus].
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });
});
