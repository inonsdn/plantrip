import type { TransportMode } from './schedule';

export interface ItineraryStopView {
  id: string;
  dayId: string;
  position: number;
  placeProvider: string;
  placeId: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  visitDurationMinutes: number | null;
  /** "ถึงกี่โมง", written down by hand. */
  arrivalLocalTime: string | null;
  /** "ออกจากที่นี่กี่โมง", written down by hand. */
  departureLocalTime: string | null;
  enabled: boolean;
  notes: string | null;
}

export interface ItineraryLegPreferenceView {
  id: string;
  dayId: string;
  originStopId: string;
  destinationStopId: string;
  transportMode: TransportMode;
  selectedRouteReference: string | null;
  manualDurationMinutes: number | null;
  visibleOnMap: boolean;
  notes: string | null;
}

export interface ItineraryDayView {
  id: string;
  tripId: string;
  localDate: string;
  startLocalTime: string;
  timeZone: string;
  defaultTransportMode: TransportMode;
  version: number;
  stops: ItineraryStopView[];
  legPreferences: ItineraryLegPreferenceView[];
}
