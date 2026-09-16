/**
 * The two decisions the itinerary queue makes, as pure functions.
 *
 * Both were once inline in the hook, where neither could be tested and both
 * were wrong.
 */

/**
 * Versions the server has actually reported, per day.
 *
 * This outlives any one batch. It used to be created fresh inside the drain
 * loop, which meant the number the server had just handed back was thrown away
 * the moment the queue emptied — so the next edit went back to reading the
 * version off the rendered page. Save once and the page is a version behind
 * until its revalidation lands; save again before that and the server refuses
 * it. Which is exactly "you can edit once and then never again".
 *
 * A key mapped to `null` means "this day changed and we were not told the new
 * number": the next task sends no expected version rather than an invented one.
 */
export type KnownVersions = Map<string, number | null>;

/**
 * What to send as `p_expected_version`.
 *
 * A day's version only ever increases, so when the reported number and the one
 * on screen disagree, the larger is simply the one that has seen more: our own
 * save that has not been re-rendered yet, or somebody else's that has. Taking
 * the larger is not a guess — neither source can be ahead of the truth.
 */
export function expectedVersion(
  dayId: string | null,
  known: KnownVersions,
  onScreenVersion: (dayId: string) => number | null,
): number | null {
  if (dayId === null) return null;

  const onScreen = onScreenVersion(dayId);
  if (!known.has(dayId)) return onScreen;

  const reported = known.get(dayId) ?? null;
  // Known to have changed, but not to what: check nothing rather than guess.
  if (reported === null) return null;

  return onScreen === null ? reported : Math.max(reported, onScreen);
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

/**
 * Refusals this fast are not a person.
 *
 * The runaway did 653 requests a second for nine hours. Somebody editing a
 * trip does one every few seconds and can quite reasonably hit a real conflict
 * twice in a row, so the threshold has to sit far above a person and far below
 * a loop. Twenty inside ten seconds is both.
 */
export const FAILURE_LIMIT = 20;
export const FAILURE_WINDOW_MS = 10_000;

/** The failure timestamps still inside the window, plus this one. */
export function noteFailure(previous: readonly number[], now: number): number[] {
  return [...previous, now].filter((at) => now - at < FAILURE_WINDOW_MS);
}

/**
 * True once the queue must stop sending until the page is reloaded.
 *
 * The backstop, and deliberately blunt: whatever starts a loop, it ends here,
 * because a client that keeps asking turns one bad edit into a request every
 * few milliseconds — for weeks, invisibly, since PostgreSQL never records a
 * statement that raises.
 */
export function shouldStop(failures: readonly number[]): boolean {
  return failures.length >= FAILURE_LIMIT;
}
