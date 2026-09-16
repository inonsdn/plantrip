/**
 * The two decisions the itinerary queue makes, as pure functions.
 *
 * Both were once inline in the hook, where neither could be tested and both
 * were wrong: the version was guessed by counting our own bumps, and a refusal
 * had no ceiling at all.
 */

/**
 * Versions the server has actually reported during one batch.
 *
 * A key mapped to `null` means "this day changed and we were not told the new
 * number" — the next task sends no expected version rather than an invented
 * one. A key that is absent means we have not touched that day yet, so the
 * version on screen is still the truth.
 */
export type KnownVersions = Map<string, number | null>;

/**
 * What to send as `p_expected_version`.
 *
 * Never arithmetic. Counting our own bumps and adding them to whatever the last
 * render showed races the revalidation that carries those same bumps: the
 * moment it lands, the count is applied twice and the next edit is refused with
 * 40001 for a conflict that never existed.
 */
export function expectedVersion(
  dayId: string | null,
  known: KnownVersions,
  onScreenVersion: (dayId: string) => number | null,
): number | null {
  if (dayId === null) return null;
  if (known.has(dayId)) return known.get(dayId) ?? null;
  return onScreenVersion(dayId);
}

/** Folds one task's outcome into what we know, in place. */
export function recordVersion(
  known: KnownVersions,
  dayId: string | null,
  reported: number | null | undefined,
  invalidates: readonly string[] = [],
): void {
  if (dayId !== null) {
    known.set(dayId, typeof reported === 'number' ? reported : null);
  }
  for (const other of invalidates) known.set(other, null);
}

/** Refusals this close together mean retrying cannot settle it. */
export const FAILURE_LIMIT = 3;
export const FAILURE_WINDOW_MS = 15_000;

/** The failure timestamps still inside the window, plus this one. */
export function noteFailure(previous: readonly number[], now: number): number[] {
  return [...previous, now].filter((at) => now - at < FAILURE_WINDOW_MS);
}

/**
 * True once the queue must stop sending until the page is reloaded.
 *
 * This is the backstop, and it is deliberately blunt. Whatever starts a loop —
 * a version race, a stale tab, a bug not yet found — it ends here, because a
 * client that keeps asking turns one bad edit into a request every few
 * milliseconds, for weeks, invisibly: PostgreSQL never records a statement that
 * raises, so the calls do not appear in pg_stat_statements at all.
 */
export function shouldStop(failures: readonly number[]): boolean {
  return failures.length >= FAILURE_LIMIT;
}
