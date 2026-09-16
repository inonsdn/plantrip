import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync('src/components/ui/sheet.tsx', 'utf8');
const planner = readFileSync('src/components/itinerary/itinerary-planner.tsx', 'utf8');
const addStop = readFileSync('src/components/itinerary/add-stop.tsx', 'utf8');
const stopDialog = readFileSync('src/components/itinerary/stop-dialog.tsx', 'utf8');
const dayDialog = readFileSync('src/components/itinerary/day-dialog.tsx', 'utf8');
const queue = readFileSync('src/components/itinerary/use-itinerary-queue.ts', 'utf8');
const header = readFileSync('src/components/trip/trip-header.tsx', 'utf8');

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

  it('each mutation submits an operation instead of awaiting', () => {
    for (const kind of [
      'reorder',
      'addStop',
      'saveStop',
      'saveDay',
      'deleteStop',
      'restoreStop',
      'moveStop',
    ]) {
      expect(planner).toContain(`kind: '${kind}'`);
    }
    // One submit per kind above — every change the planner can make.
    expect(planner.match(/submit\(\{/g) ?? []).toHaveLength(7);
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

  it('mints every id from the one v4 UUID source', () => {
    // A change id is written to storage and read back; an added place's id
    // becomes a uuid primary key. Nothing else will do, and crypto.randomUUID
    // on its own is not available outside a secure context.
    for (const source of [queue, planner]) {
      expect(source).toContain("from '@/lib/uuid'");
      expect(source).not.toContain('crypto.randomUUID');
      expect(source).not.toContain('Math.random');
    }
    expect(queue).toContain('id: uuid()');
    expect(planner).toContain('id: uuid()');
  });

  it('refuses to queue the same id twice', () => {
    expect(queue).toContain('pending.current.some((entry) => entry.id === change.id)');
  });

  it('settles each change on its own instead of dropping the batch', () => {
    // A refusal used to clear the whole queue. Each change carries an id now,
    // so the one that failed leaves and the ones behind it carry on.
    expect(queue).toContain('pending.current.filter((entry) => entry.id !== change.id)');
    expect(queue).toContain('continue;');
  });

  it('writes the unsent queue down so a closed app does not lose it', () => {
    expect(queue).toContain('saveQueue(');
    expect(queue).toContain('loadQueue(');
  });

  it('never checks a replayed change against a remembered version', () => {
    expect(queue).toContain('change.resumed');
  });

  it('reports what is in flight without touching the list', () => {
    expect(queue).toContain('pendingCount');
    expect(planner).toContain('reportPendingChanges');
    // The spinner belongs on the header, which is always on screen.
    expect(header).toContain('pendingChanges');
    expect(header).toContain('animate-spin');
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
