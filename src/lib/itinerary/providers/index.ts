import 'server-only';
import {
  ROUTE_STATUS_MESSAGES,
  type PlaceSearchResult,
  type RouteProvider,
  type RouteResult,
} from './types';

/**
 * The provider used when none is configured.
 *
 * It answers `not_configured` for everything. It deliberately returns no
 * distances, durations or geometry: a plausible-looking straight line or a
 * guessed duration would be indistinguishable from a real route, and the whole
 * point of the itinerary is that its numbers can be trusted.
 */
const unavailableProvider: RouteProvider = {
  id: 'none',
  displayName: 'ยังไม่ได้ตั้งค่า',
  supportsTransit: false,
  cachePolicy: { allowed: false, maxAgeSeconds: 0 },
  attribution: null,
  async route(): Promise<RouteResult> {
    return {
      status: 'not_configured',
      provider: 'none',
      alternatives: [],
      attribution: null,
      message: ROUTE_STATUS_MESSAGES.not_configured,
    };
  },
  async searchPlaces(): Promise<PlaceSearchResult> {
    return {
      status: 'not_configured',
      provider: 'none',
      results: [],
      attribution: null,
      message: ROUTE_STATUS_MESSAGES.not_configured,
    };
  },
};

/**
 * Resolves the configured provider.
 *
 * Adding one means implementing RouteProvider and registering it here, after
 * checking that provider's current terms for the target regions (Thailand and
 * Japan), transit coverage, quota enforcement and caching rules.
 */
export function getRouteProvider(): RouteProvider {
  const configured = process.env.ITINERARY_ROUTE_PROVIDER?.trim();
  if (!configured || configured === 'none') return unavailableProvider;

  // A name is set but no implementation is registered: say so plainly rather
  // than silently degrading to something that looks like it worked.
  return {
    ...unavailableProvider,
    id: configured,
    displayName: configured,
  };
}

export function isRoutingConfigured(): boolean {
  return getRouteProvider().id !== 'none';
}
