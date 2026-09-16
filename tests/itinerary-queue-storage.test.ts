import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadQueue, saveQueue } from '@/lib/itinerary/queue-storage';
import type { QueuedChange } from '@/lib/itinerary/operations';

function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = 1_700_000_000_000;

function change(id: string, tripId = 't1', queuedAt = NOW): QueuedChange {
  return {
    id,
    tripId,
    queuedAt,
    operation: { kind: 'reorder', dayId: 'd1', stopIds: ['a', 'b'] },
  };
}

describe('a queue that outlives the app being closed', () => {
  it('gives back what was left unsent, marked as a replay', () => {
    saveQueue('t1', [change('one'), change('two')]);
    const resumed = loadQueue('t1', NOW);

    expect(resumed.map((entry) => entry.id)).toEqual(['one', 'two']);
    // Nothing that comes back from storage can be checked against a version we
    // remembered before the app closed, so each one says it is a replay.
    expect(resumed.every((entry) => entry.resumed)).toBe(true);
  });

  it('keeps each trip to itself', () => {
    saveQueue('t1', [change('mine')]);
    expect(loadQueue('t2', NOW)).toEqual([]);
  });

  it('drops anything the plan has almost certainly moved past', () => {
    const day = 24 * 60 * 60 * 1000;
    saveQueue('t1', [change('stale', 't1', NOW - day - 1), change('fresh', 't1', NOW - 1_000)]);
    expect(loadQueue('t1', NOW).map((entry) => entry.id)).toEqual(['fresh']);
  });

  it('clears the record once nothing is left to send', () => {
    saveQueue('t1', [change('one')]);
    saveQueue('t1', []);
    expect(storage.entries.size).toBe(0);
    expect(loadQueue('t1', NOW)).toEqual([]);
  });

  it('ignores anything it cannot read rather than losing the plan', () => {
    storage.setItem('tripmate:itinerary-queue:t1', 'not json at all');
    expect(loadQueue('t1', NOW)).toEqual([]);

    storage.setItem('tripmate:itinerary-queue:t1', '[{"nope":1},null,3]');
    expect(loadQueue('t1', NOW)).toEqual([]);
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem() {
          throw new Error('blocked');
        },
        setItem() {
          throw new Error('blocked');
        },
        removeItem() {
          throw new Error('blocked');
        },
      },
    });

    expect(() => saveQueue('t1', [change('one')])).not.toThrow();
    expect(loadQueue('t1', NOW)).toEqual([]);
  });

  it('refuses to hoard: a queue longer than the cap is a bug, not a backlog', () => {
    saveQueue(
      't1',
      Array.from({ length: 80 }, (_, index) => change(`c${index}`)),
    );
    const resumed = loadQueue('t1', NOW);
    expect(resumed).toHaveLength(50);
    // The newest are the ones worth keeping.
    expect(resumed.at(-1)?.id).toBe('c79');
  });
});
