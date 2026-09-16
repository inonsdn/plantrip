'use client';

import {
  addItineraryStopAction,
  deleteItineraryStopAction,
  moveItineraryStopAction,
  reorderItineraryStopsAction,
  restoreItineraryStopAction,
  saveItineraryStopAction,
  updateItineraryDayAction,
} from '@/lib/actions/itinerary';
import type { ActionResult } from '@/lib/actions/result';
import type { ItineraryOperation } from '@/lib/itinerary/operations';

/**
 * Sends one queued change.
 *
 * `expectedVersion` is null when there is nothing to check against — either the
 * change does not touch a single day's version, or it is being replayed after
 * the app was closed, where no version we remember means anything any more.
 */
export function runOperation(
  tripId: string,
  operation: ItineraryOperation,
  expectedVersion: number | null,
): Promise<ActionResult<{ version?: number | null } | undefined>> {
  const version = expectedVersion ?? undefined;

  switch (operation.kind) {
    case 'reorder':
      return reorderItineraryStopsAction({
        tripId,
        dayId: operation.dayId,
        stopIds: operation.stopIds,
        expectedVersion: version,
      });

    case 'addStop':
      return addItineraryStopAction({
        tripId,
        dayId: operation.dayId,
        id: operation.stop.id,
        name: operation.stop.name,
        address: operation.stop.address,
        latitude: operation.stop.latitude,
        longitude: operation.stop.longitude,
        placeProvider: operation.stop.placeProvider,
        placeId: operation.stop.placeId,
        visitDurationMinutes: operation.stop.visitDurationMinutes,
        notBeforeLocalTime: operation.stop.notBeforeLocalTime,
        expectedVersion: version,
      });

    case 'saveStop':
      return saveItineraryStopAction({
        tripId,
        stopId: operation.stopId,
        stop: operation.stop,
        leg: operation.leg,
        expectedVersion: version,
      });

    case 'saveDay':
      return updateItineraryDayAction({
        tripId,
        dayId: operation.dayId,
        startLocalTime: operation.day.startLocalTime,
        timeZone: operation.day.timeZone,
        defaultTransportMode: operation.day.defaultTransportMode,
        expectedVersion: version,
      });

    case 'deleteStop':
      return deleteItineraryStopAction(tripId, operation.stopId);

    case 'restoreStop':
      return restoreItineraryStopAction(tripId, operation.stop.id);

    case 'moveStop':
      return moveItineraryStopAction(tripId, operation.stopId, operation.toDayId);
  }
}
