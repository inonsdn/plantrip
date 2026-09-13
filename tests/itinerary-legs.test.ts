import { describe, expect, it } from 'vitest';
import { buildLegPairs, orphanedPreferences, resolveLegs, type StoredLegPreference } from '@/lib/itinerary/legs';
import { legKey } from '@/lib/itinerary/schedule';

const A = { id: 'a', enabled: true };
const B = { id: 'b', enabled: true };
const C = { id: 'c', enabled: true };

function preference(
  origin: string,
  destination: string,
  extra: Partial<StoredLegPreference> = {},
): StoredLegPreference {
  return {
    legKey: legKey(origin, destination),
    originStopId: origin,
    destinationStopId: destination,
    transportMode: 'walking',
    selectedRouteReference: null,
    manualDurationMinutes: null,
    visibleOnMap: true,
    notes: null,
    ...extra,
  };
}

describe('leg topology', () => {
  it('pairs consecutive enabled stops', () => {
    expect(buildLegPairs([A, B, C]).map((pair) => pair.legKey)).toEqual([
      legKey('a', 'b'),
      legKey('b', 'c'),
    ]);
  });

  it('skips disabled stops so A -> C becomes one leg', () => {
    expect(buildLegPairs([A, { ...B, enabled: false }, C]).map((p) => p.legKey)).toEqual([
      legKey('a', 'c'),
    ]);
  });

  it('has no legs for zero or one enabled stop', () => {
    expect(buildLegPairs([])).toEqual([]);
    expect(buildLegPairs([A])).toEqual([]);
    expect(buildLegPairs([A, { ...B, enabled: false }])).toEqual([]);
  });
});

describe('preserving settings across a reorder', () => {
  const stored = [
    preference('a', 'b', { transportMode: 'transit', selectedRouteReference: 'route-1' }),
    preference('b', 'c', { transportMode: 'driving', manualDurationMinutes: 25 }),
  ];

  it('keeps settings for a pair that is still adjacent', () => {
    const legs = resolveLegs([A, B, C], stored, 'walking');
    expect(legs[0]).toMatchObject({
      transportMode: 'transit',
      selectedRouteReference: 'route-1',
      fromStoredPreference: true,
    });
  });

  it('never hands a saved route to a different pair after A B C becomes A C B', () => {
    const legs = resolveLegs([A, C, B], stored, 'walking');
    expect(legs.map((leg) => leg.legKey)).toEqual([legKey('a', 'c'), legKey('c', 'b')]);

    // Both pairs are new, so both take the day's default and neither inherits
    // the transit route saved for a -> b.
    expect(legs.every((leg) => leg.fromStoredPreference === false)).toBe(true);
    expect(legs.every((leg) => leg.transportMode === 'walking')).toBe(true);
    expect(legs.every((leg) => leg.selectedRouteReference === null)).toBe(true);
  });

  it('gives a newly created pair the day default mode', () => {
    const legs = resolveLegs([A, { ...B, enabled: false }, C], stored, 'driving');
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ legKey: legKey('a', 'c'), transportMode: 'driving', fromStoredPreference: false });
  });

  it('restores the saved settings when the original order comes back', () => {
    const reordered = resolveLegs([A, C, B], stored, 'walking');
    expect(reordered[0].fromStoredPreference).toBe(false);

    const restored = resolveLegs([A, B, C], stored, 'walking');
    expect(restored[0]).toMatchObject({ transportMode: 'transit', selectedRouteReference: 'route-1' });
    expect(restored[1]).toMatchObject({ transportMode: 'driving', manualDurationMinutes: 25 });
  });

  it('keeps a disabled stop out of the legs but not out of storage', () => {
    const stops = [A, { ...B, enabled: false }, C];
    expect(orphanedPreferences(stops, stored).map((p) => p.legKey)).toEqual([
      legKey('a', 'b'),
      legKey('b', 'c'),
    ]);

    // Re-enabling B brings both back into use untouched.
    expect(orphanedPreferences([A, B, C], stored)).toEqual([]);
  });
});

describe('map visibility is independent of the plan', () => {
  it('hiding a leg changes nothing about its mode or duration', () => {
    const hidden = [preference('a', 'b', { transportMode: 'transit', visibleOnMap: false })];
    const legs = resolveLegs([A, B], hidden, 'walking');
    expect(legs[0].visibleOnMap).toBe(false);
    expect(legs[0].transportMode).toBe('transit');
    // buildLegPairs, which the schedule is derived from, does not consider it.
    expect(buildLegPairs([A, B])).toHaveLength(1);
  });
});
