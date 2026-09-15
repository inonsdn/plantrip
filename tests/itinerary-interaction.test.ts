import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync('src/components/ui/sheet.tsx', 'utf8');
const planner = readFileSync('src/components/itinerary/itinerary-planner.tsx', 'utf8');
const addStop = readFileSync('src/components/itinerary/add-stop.tsx', 'utf8');
const stopDialog = readFileSync('src/components/itinerary/stop-dialog.tsx', 'utf8');
const dayDialog = readFileSync('src/components/itinerary/day-dialog.tsx', 'utf8');

/**
 * The sheet's focus effect restores focus on cleanup. `onClose` is an inline
 * arrow at every call site, so depending on it made the effect re-run on every
 * render of the owner — which on a phone pulled focus out of the field being
 * typed into and closed the keyboard. A background save landing was enough.
 */
describe('the sheet only takes focus when it opens', () => {
  it('the focus effect depends on `open` alone', () => {
    expect(sheet).toContain('}, [open]);');
    expect(sheet).not.toMatch(/\}, \[open,[^\]]*\]\);/);
  });

  it('the escape handler reads the callback through a ref', () => {
    expect(sheet).toContain('closeRef.current()');
  });
});

/**
 * Every itinerary change is optimistic: it lands on screen at once and the
 * queue reconciles it. Nothing may block the person behind a spinner, and
 * nothing may disable a field they are typing into — a disabled input loses
 * focus, and losing focus closes the keyboard.
 */
describe('every itinerary mutation goes through the queue', () => {
  it('the planner runs no blocking transition of its own', () => {
    expect(planner).not.toContain('useTransition');
    expect(planner).not.toContain('startTransition');
  });

  it('each mutation enqueues instead of awaiting', () => {
    for (const mutation of [
      'จัดลำดับสถานที่',
      'เพิ่มสถานที่',
      'บันทึกวัน',
      'บันทึกสถานที่',
      'ลบสถานที่',
      'ย้ายสถานที่',
    ]) {
      expect(planner).toContain(`label: '${mutation}'`);
    }
    // One enqueue per label above, plus the "เลิกทำ" restore.
    expect(planner.match(/enqueue\(\{/g) ?? []).toHaveLength(7);
  });

  it('no itinerary field disables itself while a save is in flight', () => {
    for (const source of [addStop, stopDialog, dayDialog]) {
      expect(source).not.toContain('disabled={busy}');
      expect(source).not.toContain('busy: boolean');
    }
  });
});
