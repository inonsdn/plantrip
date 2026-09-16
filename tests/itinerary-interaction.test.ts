import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync('src/components/ui/sheet.tsx', 'utf8');
const planner = readFileSync('src/components/itinerary/itinerary-planner.tsx', 'utf8');
const addStop = readFileSync('src/components/itinerary/add-stop.tsx', 'utf8');
const stopDialog = readFileSync('src/components/itinerary/stop-dialog.tsx', 'utf8');
const dayDialog = readFileSync('src/components/itinerary/day-dialog.tsx', 'utf8');
const queue = readFileSync('src/components/itinerary/use-itinerary-queue.ts', 'utf8');

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

/**
 * The version sent with an edit comes from the server, never from counting.
 *
 * The queue used to add its own bumps to whatever the last render showed. That
 * races the revalidation carrying those same bumps: once it lands the count is
 * applied twice, and the next edit is refused with 40001 for a conflict that
 * never happened. Postgres does not record a statement that raises, so those
 * refusals were invisible in pg_stat_statements — only the PostgREST
 * pre-request that preceded each one was counted.
 */
describe('the queue never invents a version, and never retries forever', () => {
  it('does no arithmetic on versions', () => {
    // The old shape: a local tally of our own bumps added to the last render.
    expect(queue).not.toContain('task.bumps');
    expect(queue).not.toMatch(/bumps\.(get|set)\b/);
    expect(queue).not.toMatch(/serverVersion\s*\+/);
  });

  it('reads the expected version through the tested policy', () => {
    expect(queue).toContain('expectedVersion(');
    expect(queue).toContain('recordVersion(');
  });

  it('stops sending once refusals pile up', () => {
    expect(queue).toContain('shouldStop(');
    expect(queue).toContain('setHalted(true)');
    // The backstop only works if enqueue itself honours it.
    expect(queue).toMatch(/if \(halted\) \{/);
  });

  it('never drops a change without saying so', () => {
    // A halted queue that returns quietly is indistinguishable from a save
    // that worked: the dialog closes, the change disappears, nothing explains
    // it. Every refused enqueue has to reach the person.
    const halted = queue.slice(queue.indexOf('if (halted) {'));
    const body = halted.slice(0, halted.indexOf('return;'));
    expect(body).toContain('showToast');
  });

  it('keeps the version the server reported for the whole session', () => {
    // Not a local inside drain(): the queue goes idle between edits, and a
    // version thrown away there is a version read back off a stale page.
    expect(queue).toContain('useRef<KnownVersions>');
    expect(queue).not.toMatch(/const known: KnownVersions = new Map\(\);/);
  });

  it('shows the person that saving has stopped', () => {
    expect(planner).toContain('halted');
    expect(planner).toContain('โหลดหน้าใหม่');
  });
});
