'use client';

import { useEffect, useRef, useState } from 'react';
import type { LatLng, RouteResult, RouteStatus } from '@/lib/itinerary/providers/types';
import type { TransportMode } from '@/lib/itinerary/schedule';

export interface LegRouteRequest {
  legKey: string;
  mode: TransportMode;
  origin: LatLng;
  destination: LatLng;
  /** The day this leg is planned on, as a local calendar date. */
  localDate: string;
  /** The day's IANA time zone. */
  timeZone: string;
  /**
   * Planned departure in minutes since local midnight, or null when it cannot
   * be known yet. Only transit results depend on it.
   */
  departureMinutes: number | null;
}

export type LegRouteState =
  | { phase: 'loading' }
  | { phase: 'done'; result: RouteResult };

/**
 * One request key per (pair, mode, and — for transit only — departure slot).
 *
 * Driving and walking results do not depend on when you leave, so leaving the
 * time out of their key stops an upstream duration change from re-requesting
 * every leg behind it. Transit rounds to five minutes so that a one-minute
 * ripple upstream does not start a new request.
 */
function requestKey(request: LegRouteRequest): string {
  if (request.mode !== 'transit' || request.departureMinutes === null) {
    return `${request.legKey}|${request.mode}`;
  }
  const slot = Math.floor(request.departureMinutes / 5);
  return `${request.legKey}|${request.mode}|${request.localDate}|${request.timeZone}|${slot}`;
}

/**
 * The UTC offset a zone is on at a given instant, in minutes.
 *
 * Derived from Intl rather than a table so daylight saving and historical
 * changes come from the platform's own zone data.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour') % 24,
    read('minute'),
    read('second'),
  );
  return (asUtc - instant.getTime()) / 60000;
}

/**
 * `2026-03-01` + 570 minutes in `Asia/Tokyo` -> the matching UTC instant.
 * Minutes past 1440 roll into the following day, which is what a plan running
 * past midnight means. Returns null when the zone is not one the platform knows.
 */
export function zonedLocalToIso(
  localDate: string,
  minutes: number,
  timeZone: string,
): string | null {
  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  try {
    const naive = Date.UTC(year, month - 1, day) + minutes * 60000;
    // Two passes: the first offset is read at the naive instant, the second at
    // the corrected one, which settles zones that change offset that day.
    let instant = naive;
    for (let pass = 0; pass < 2; pass += 1) {
      instant = naive - zoneOffsetMinutes(new Date(instant), timeZone) * 60000;
    }
    return new Date(instant).toISOString();
  } catch {
    return null;
  }
}

function failure(status: RouteStatus, message: string): RouteResult {
  return { status, provider: 'none', alternatives: [], attribution: null, message };
}

/**
 * Turns whatever came back into a RouteResult.
 *
 * The endpoint answers with a RouteResult for every routing outcome, but auth,
 * membership and validation failures are plain HTTP errors — those must read as
 * their own explicit states rather than as a provider fault.
 */
function normaliseResponse(httpStatus: number, body: unknown): RouteResult {
  const candidate = body as Partial<RouteResult> | null;
  if (candidate && typeof candidate.status === 'string' && Array.isArray(candidate.alternatives)) {
    return candidate as RouteResult;
  }

  if (httpStatus === 401) return failure('provider_error', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  if (httpStatus === 403) {
    return failure('provider_error', 'คุณไม่มีสิทธิ์ดูเส้นทางของทริปนี้');
  }
  if (httpStatus === 400) return failure('provider_error', 'ข้อมูลจุดต้นทางหรือปลายทางไม่ถูกต้อง');
  return failure('provider_error', 'ติดต่อบริการเส้นทางไม่สำเร็จ');
}

const DEBOUNCE_MS = 400;

/**
 * Fetches routes for the day's legs.
 *
 * Requests are debounced, answered from an in-memory cache keyed by the exact
 * request, and every response from a superseded run is dropped rather than
 * applied late. Legs only ever depend on legs before them, so a duration change
 * ripples forward and stops — it can never feed back into its own request.
 */
export function useLegRoutes(
  tripId: string,
  requests: readonly LegRouteRequest[],
): Record<string, LegRouteState> {
  const [states, setStates] = useState<Record<string, LegRouteState>>({});
  const cache = useRef(new Map<string, RouteResult>());
  const runId = useRef(0);

  // Only the identity of the requests matters, not the array reference.
  const signature = requests.map(requestKey).join(',');
  const latest = useRef(requests);

  // Kept current after every commit, so the debounced run below always reads
  // the freshest coordinates even when the signature has not changed.
  useEffect(() => {
    latest.current = requests;
  });

  useEffect(() => {
    const currentRun = (runId.current += 1);
    const controller = new AbortController();

    const timer = setTimeout(() => {
      void (async () => {
        const pending = latest.current.filter(
          (request) => !cache.current.has(requestKey(request)),
        );

        // Answer everything already cached straight away, and mark the rest as
        // loading in one update so the panel never flickers per leg.
        setStates(() => {
          const next: Record<string, LegRouteState> = {};
          for (const request of latest.current) {
            const cached = cache.current.get(requestKey(request));
            next[request.legKey] = cached
              ? { phase: 'done', result: cached }
              : { phase: 'loading' };
          }
          return next;
        });

        for (const request of pending) {
          if (controller.signal.aborted || runId.current !== currentRun) return;

          let result: RouteResult;
          try {
            const response = await fetch('/api/itinerary/route', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                tripId,
                mode: request.mode,
                origin: request.origin,
                destination: request.destination,
                departureIso:
                  request.departureMinutes === null
                    ? null
                    : zonedLocalToIso(
                        request.localDate,
                        request.departureMinutes,
                        request.timeZone,
                      ),
              }),
              signal: controller.signal,
            });
            result = normaliseResponse(response.status, await response.json().catch(() => null));
          } catch {
            if (controller.signal.aborted) return;
            result = failure('provider_error', 'ติดต่อบริการเส้นทางไม่สำเร็จ');
          }

          if (runId.current !== currentRun) return;

          // Transient states are not cached: retrying later is the whole point.
          if (result.status !== 'rate_limited' && result.status !== 'provider_error') {
            cache.current.set(requestKey(request), result);
          }

          setStates((current) => ({
            ...current,
            [request.legKey]: { phase: 'done', result },
          }));
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `signature` collapses the request list to the things that change a result.
  }, [tripId, signature]);

  return states;
}
