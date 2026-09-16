import { describe, expect, it } from 'vitest';
import {
  FAILURE_LIMIT,
  FAILURE_WINDOW_MS,
  expectedVersion,
  noteFailure,
  recordVersion,
  shouldStop,
  type KnownVersions,
} from '@/lib/itinerary/queue-policy';

const onScreen = (versions: Record<string, number>) => (dayId: string) =>
  versions[dayId] ?? null;

describe('the expected version is never invented', () => {
  it('uses what is on screen for a day this batch has not touched', () => {
    const known: KnownVersions = new Map();
    expect(expectedVersion('d1', known, onScreen({ d1: 5 }))).toBe(5);
  });

  it('uses what the server reported, not the screen, once the batch has one', () => {
    const known: KnownVersions = new Map();
    recordVersion(known, 'd1', 6);
    // The page still shows 5 — the revalidation has not landed yet. Adding our
    // own bump to 5 would be right now and wrong the moment it does land, which
    // is exactly the race that produced 40001 for edits in conflict with
    // nothing.
    expect(expectedVersion('d1', known, onScreen({ d1: 5 }))).toBe(6);
    expect(expectedVersion('d1', known, onScreen({ d1: 6 }))).toBe(6);
  });

  it('sends nothing to check against when the new version was not reported', () => {
    const known: KnownVersions = new Map();
    recordVersion(known, 'd1', undefined);
    expect(expectedVersion('d1', known, onScreen({ d1: 5 }))).toBeNull();
  });

  it('forgets the version of every day a task changed silently', () => {
    const known: KnownVersions = new Map();
    recordVersion(known, 'd1', 6);
    // A move bumps the day it left and the day it joins, and reports neither.
    recordVersion(known, null, undefined, ['d1', 'd2']);
    expect(expectedVersion('d1', known, onScreen({ d1: 5 }))).toBeNull();
    expect(expectedVersion('d2', known, onScreen({ d2: 9 }))).toBeNull();
  });

  it('checks nothing for a task that is not about one day', () => {
    expect(expectedVersion(null, new Map(), onScreen({ d1: 5 }))).toBeNull();
  });

  it('walks a whole batch without ever guessing', () => {
    const known: KnownVersions = new Map();
    const screen = onScreen({ d1: 5 });
    const sent: Array<number | null> = [];

    // Three edits in a row, each reporting the version it produced, while the
    // page underneath still says 5 the whole time.
    for (const reported of [6, 7, 8]) {
      sent.push(expectedVersion('d1', known, screen));
      recordVersion(known, 'd1', reported);
    }

    expect(sent).toEqual([5, 6, 7]);
  });
});

describe('the queue stops rather than retrying forever', () => {
  it('lets a single refusal through', () => {
    const failures = noteFailure([], 1_000);
    expect(failures).toHaveLength(1);
    expect(shouldStop(failures)).toBe(false);
  });

  it('gives up once refusals pile up inside the window', () => {
    let failures: number[] = [];
    for (let i = 0; i < FAILURE_LIMIT; i += 1) failures = noteFailure(failures, 1_000 + i * 100);
    expect(shouldStop(failures)).toBe(true);
  });

  it('forgets refusals that fall outside the window', () => {
    let failures: number[] = [];
    for (let i = 0; i < FAILURE_LIMIT - 1; i += 1) failures = noteFailure(failures, 1_000);
    failures = noteFailure(failures, 1_000 + FAILURE_WINDOW_MS + 1);
    expect(failures).toEqual([1_000 + FAILURE_WINDOW_MS + 1]);
    expect(shouldStop(failures)).toBe(false);
  });
});
