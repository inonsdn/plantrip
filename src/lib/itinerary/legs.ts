import { legKey, type TransportMode } from './schedule';

/**
 * Leg topology.
 *
 * A leg belongs to an ordered *pair of stops*, never to a position. Reordering,
 * moving or disabling a stop therefore cannot hand one journey's saved mode or
 * route to a different journey: the key simply stops matching and the pair gets
 * the day's default instead. Restore the old order and the old settings come
 * back intact, because the pair is the same pair again.
 */

export interface StoredLegPreference {
  legKey: string;
  originStopId: string;
  destinationStopId: string;
  transportMode: TransportMode;
  selectedRouteReference: string | null;
  manualDurationMinutes: number | null;
  visibleOnMap: boolean;
}

export interface ResolvedLeg extends StoredLegPreference {
  /** False when this pair had no saved preference and took the day default. */
  fromStoredPreference: boolean;
}

export interface StopLike {
  id: string;
  enabled: boolean;
}

/** The consecutive pairs of enabled stops, in order. */
export function buildLegPairs(
  stops: readonly StopLike[],
): Array<{ legKey: string; originStopId: string; destinationStopId: string }> {
  const enabled = stops.filter((stop) => stop.enabled);
  const pairs: Array<{ legKey: string; originStopId: string; destinationStopId: string }> = [];

  for (let index = 1; index < enabled.length; index += 1) {
    const originStopId = enabled[index - 1].id;
    const destinationStopId = enabled[index].id;
    pairs.push({ legKey: legKey(originStopId, destinationStopId), originStopId, destinationStopId });
  }

  return pairs;
}

/**
 * The legs a day currently has, each carrying either its saved settings or the
 * day's default mode.
 */
export function resolveLegs(
  stops: readonly StopLike[],
  stored: readonly StoredLegPreference[],
  defaultMode: TransportMode,
): ResolvedLeg[] {
  const byKey = new Map(stored.map((preference) => [preference.legKey, preference]));

  return buildLegPairs(stops).map((pair) => {
    const saved = byKey.get(pair.legKey);
    if (saved) return { ...saved, fromStoredPreference: true };

    return {
      ...pair,
      transportMode: defaultMode,
      selectedRouteReference: null,
      manualDurationMinutes: null,
      visibleOnMap: true,
      fromStoredPreference: false,
    };
  });
}

/**
 * Saved preferences whose pair is no longer adjacent.
 *
 * They are kept rather than deleted — restoring the order restores the
 * settings — but they must never be shown or used while the pair is not a leg.
 */
export function orphanedPreferences(
  stops: readonly StopLike[],
  stored: readonly StoredLegPreference[],
): StoredLegPreference[] {
  const live = new Set(buildLegPairs(stops).map((pair) => pair.legKey));
  return stored.filter((preference) => !live.has(preference.legKey));
}
