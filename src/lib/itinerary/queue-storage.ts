import type { QueuedChange } from './operations';

/**
 * The unsent queue, kept across a closed app.
 *
 * Browser storage is a scratchpad here, never a source of truth: the trips and
 * the plan itself always come from the database. What is written down is only
 * the handful of changes that had not reached the server yet, so closing the
 * app mid-save does not throw them away.
 */

const PREFIX = 'tripmate:itinerary-queue:';
const VERSION_PREFIX = 'tripmate:itinerary-versions:';
/** Older than this and the plan has almost certainly moved on without it. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** A queue longer than this is a bug, not a backlog. */
const MAX_ENTRIES = 50;

function key(tripId: string): string {
  return `${PREFIX}${tripId}`;
}

function isChange(value: unknown): value is QueuedChange {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<QueuedChange>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tripId === 'string' &&
    typeof candidate.queuedAt === 'number' &&
    typeof candidate.operation === 'object' &&
    candidate.operation !== null &&
    typeof (candidate.operation as { kind?: unknown }).kind === 'string'
  );
}

/** Whatever is still worth sending. Anything unreadable is discarded, quietly. */
export function loadQueue(tripId: string, now = Date.now()): QueuedChange[] {
  try {
    const raw = window.localStorage.getItem(key(tripId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isChange)
      .filter((change) => change.tripId === tripId && now - change.queuedAt < MAX_AGE_MS)
      .slice(-MAX_ENTRIES)
      .map((change) => ({ ...change, resumed: true }));
  } catch {
    // Private mode, blocked storage, corrupt JSON: the plan still loads.
    return [];
  }
}

export function saveQueue(tripId: string, changes: readonly QueuedChange[]): void {
  try {
    if (changes.length === 0) {
      window.localStorage.removeItem(key(tripId));
      return;
    }
    window.localStorage.setItem(key(tripId), JSON.stringify(changes.slice(-MAX_ENTRIES)));
  } catch {
    // Out of quota or storage denied: the queue still works for this session.
  }
}

// ---------------------------------------------------------------------------
// known versions
// ---------------------------------------------------------------------------

/**
 * The last version the server reported for each day.
 *
 * This is kept next to the queue for one reason: a ref only lives as long as
 * the component holding it. Anything that remounts the planner — a revalidation
 * that re-suspends its boundary, navigating away and back, a tab restored from
 * the phone's memory — wipes it, and the next edit falls back to reading the
 * version off a page that is one save behind. The server refuses it, and from
 * the outside the app can be edited exactly once.
 *
 * It is a cache of what the server said, never a source of truth: the page's
 * own version always wins when it is further ahead.
 */
export function loadVersions(tripId: string): Map<string, number> {
  try {
    const raw = window.localStorage.getItem(`${VERSION_PREFIX}${tripId}`);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return new Map();

    const versions = new Map<string, number>();
    for (const [dayId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        versions.set(dayId, value);
      }
    }
    return versions;
  } catch {
    return new Map();
  }
}

export function saveVersions(tripId: string, versions: ReadonlyMap<string, number | null>): void {
  try {
    const plain: Record<string, number> = {};
    for (const [dayId, version] of versions) {
      if (typeof version === 'number') plain[dayId] = version;
    }
    if (Object.keys(plain).length === 0) {
      window.localStorage.removeItem(`${VERSION_PREFIX}${tripId}`);
      return;
    }
    window.localStorage.setItem(`${VERSION_PREFIX}${tripId}`, JSON.stringify(plain));
  } catch {
    // Storage denied: the queue still works for as long as this page lives.
  }
}
