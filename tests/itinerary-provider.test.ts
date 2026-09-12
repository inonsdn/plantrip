import { afterEach, describe, expect, it } from 'vitest';
import { getRouteProvider, isRoutingConfigured } from '@/lib/itinerary/providers';
import { ROUTE_STATUS_MESSAGES, type RouteStatus } from '@/lib/itinerary/providers/types';

const ORIGINAL = process.env.ITINERARY_ROUTE_PROVIDER;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ITINERARY_ROUTE_PROVIDER;
  else process.env.ITINERARY_ROUTE_PROVIDER = ORIGINAL;
});

const REQUEST = {
  mode: 'transit' as const,
  origin: { latitude: 13.7563, longitude: 100.5018 },
  destination: { latitude: 13.7466, longitude: 100.5347 },
  departureIso: '2026-03-01T02:30:00.000Z',
};

describe('routing provider registry', () => {
  it('reports that routing is unconfigured when no provider is set', () => {
    delete process.env.ITINERARY_ROUTE_PROVIDER;
    expect(isRoutingConfigured()).toBe(false);
    expect(getRouteProvider().id).toBe('none');
  });

  it('never invents a duration, a distance or a geometry', async () => {
    delete process.env.ITINERARY_ROUTE_PROVIDER;
    const result = await getRouteProvider().route(REQUEST);

    expect(result.status).toBe('not_configured');
    expect(result.alternatives).toEqual([]);
    expect(result.message).toBe(ROUTE_STATUS_MESSAGES.not_configured);
  });

  it('returns no places rather than a guess', async () => {
    delete process.env.ITINERARY_ROUTE_PROVIDER;
    const result = await getRouteProvider().searchPlaces('วัดพระแก้ว');

    expect(result.status).toBe('not_configured');
    expect(result.results).toEqual([]);
  });

  it('stays unavailable when a provider name has no implementation behind it', async () => {
    process.env.ITINERARY_ROUTE_PROVIDER = 'some-unregistered-provider';
    const provider = getRouteProvider();

    expect(provider.id).toBe('some-unregistered-provider');
    expect(provider.supportsTransit).toBe(false);
    expect(provider.cachePolicy.allowed).toBe(false);
    // A name in an environment variable must not make a missing integration
    // look like a working one.
    expect((await provider.route(REQUEST)).alternatives).toEqual([]);
  });

  it('has Thai copy for every failure state', () => {
    const states: RouteStatus[] = [
      'not_configured',
      'unsupported_mode',
      'unsupported_region',
      'no_route',
      'outside_schedule_window',
      'quota_exhausted',
      'rate_limited',
      'provider_error',
    ];
    for (const state of states) {
      expect(ROUTE_STATUS_MESSAGES[state].length).toBeGreaterThan(0);
    }
  });
});
