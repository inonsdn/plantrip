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
