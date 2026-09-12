import type { TransportMode } from '../schedule';

/**
 * Routing provider contract.
 *
 * Every failure is a named state rather than an exception or an invented
 * answer: the UI must be able to say precisely why a leg has no time, and the
 * schedule must treat "we do not know" as unknown rather than zero.
 */

export type RouteStatus =
  | 'ok'
  | 'not_configured'
  | 'unsupported_mode'
  | 'unsupported_region'
  | 'no_route'
  | 'outside_schedule_window'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'provider_error';

/** Thai copy for each state, so the UI never has to invent an explanation. */
export const ROUTE_STATUS_MESSAGES: Record<RouteStatus, string> = {
  ok: '',
  not_configured: 'ยังไม่ได้ตั้งค่าผู้ให้บริการเส้นทาง จึงคำนวณเวลาเดินทางอัตโนมัติไม่ได้',
  unsupported_mode: 'ผู้ให้บริการที่ตั้งค่าไว้ไม่รองรับการเดินทางรูปแบบนี้ในพื้นที่นี้',
  unsupported_region: 'ผู้ให้บริการไม่ครอบคลุมพื้นที่นี้',
  no_route: 'ไม่พบเส้นทางระหว่างสองจุดนี้',
  outside_schedule_window: 'วันที่เลือกอยู่นอกช่วงตารางเดินรถที่ผู้ให้บริการมีข้อมูล',
  quota_exhausted: 'ใช้โควตาการเรียกเส้นทางของวันนี้ครบแล้ว',
  rate_limited: 'เรียกเส้นทางถี่เกินไป กรุณารอสักครู่',
  provider_error: 'ผู้ให้บริการเส้นทางตอบกลับไม่สำเร็จ',
};

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface TransitStepDetail {
  kind: 'walk' | 'transit';
  /** Line name exactly as the provider returned it; never invented. */
  lineName: string | null;
  boardStopName: string | null;
  alightStopName: string | null;
  departureIso: string | null;
  arrivalIso: string | null;
  durationMinutes: number | null;
  distanceMeters: number | null;
}

export interface RouteAlternative {
  /** Stable handle stored in itinerary_leg_preferences.selected_route_reference. */
  reference: string;
  durationMinutes: number;
  distanceMeters: number | null;
  /** Waiting the provider itself reported, already inside durationMinutes. */
  transitWaitMinutes: number | null;
  transferCount: number | null;
  /** GeoJSON LineString coordinates, or null when the provider returned none. */
  geometry: Array<[number, number]> | null;
  steps: TransitStepDetail[];
  departureIso: string | null;
  arrivalIso: string | null;
  /** Fare the provider itself quoted, if any. Always an estimate — never a total. */
  fareAmount: string | null;
  fareCurrency: string | null;
}

export interface RouteResult {
  status: RouteStatus;
  provider: string;
  /** Empty unless status is 'ok'. Never populated with estimates. */
  alternatives: RouteAlternative[];
  /** Provider attribution that must be shown wherever the route is shown. */
  attribution: string | null;
  message: string;
}

export interface RouteRequest {
  mode: TransportMode;
  origin: LatLng;
  destination: LatLng;
  /** Planned departure for this leg; transit requests must honour it. */
  departureIso: string | null;
}

export interface PlaceResult {
  placeProvider: string;
  placeId: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

export interface PlaceSearchResult {
  status: RouteStatus;
  provider: string;
  results: PlaceResult[];
  attribution: string | null;
  message: string;
}

export interface RouteProvider {
  id: string;
  displayName: string;
  supportsTransit: boolean;
  /** Caching is only legal for some providers; see their terms. */
  cachePolicy: { allowed: boolean; maxAgeSeconds: number };
  attribution: string | null;
  route(request: RouteRequest): Promise<RouteResult>;
  searchPlaces(query: string, near?: LatLng): Promise<PlaceSearchResult>;
}
