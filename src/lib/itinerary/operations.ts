import type { ItineraryDayView, ItineraryStopView } from './types';
import type { TransportMode } from './schedule';
import {
  insertStop,
  moveStopToDay,
  removeStop,
  reorderStops,
  updateDay,
  updateStop,
} from './optimistic';

/**
 * A pending itinerary change, as data.
 *
 * These used to be closures handed to the queue, which meant a change existed
 * only for as long as the tab did: close the app mid-save and it was gone.
 * Described as data they can be written down, replayed, and named in a toast —
 * and every one of them is idempotent, so replaying one that already landed
 * changes nothing.
 */

export interface StopValues {
  name: string;
  notes: string | null;
  visitDurationMinutes: number | null;
  arrivalLocalTime: string | null;
  departureLocalTime: string | null;
  enabled: boolean;
}

export interface LegValues {
  destinationStopId: string;
  transportMode: TransportMode;
  manualDurationMinutes: number | null;
  notes: string | null;
}

export interface DayValues {
  startLocalTime: string;
  timeZone: string;
  defaultTransportMode: TransportMode;
}

export type ItineraryOperation =
  | { kind: 'reorder'; dayId: string; stopIds: string[] }
  /** The stop carries the id it will have in the database, so a replay collides. */
  | { kind: 'addStop'; dayId: string; stop: ItineraryStopView }
  | { kind: 'saveStop'; dayId: string; stopId: string; stop: StopValues; leg: LegValues | null }
  | { kind: 'saveDay'; dayId: string; day: DayValues }
  | { kind: 'deleteStop'; stopId: string }
  | { kind: 'restoreStop'; dayId: string; stop: ItineraryStopView }
  | { kind: 'moveStop'; stopId: string; fromDayId: string; toDayId: string };

/** One queued change, identified for its whole life by `id`. */
export interface QueuedChange {
  /**
   * Identifies this change everywhere: in the queue, in the toast that names
   * it, and — for an added place — as the primary key of the row it creates.
   */
  id: string;
  tripId: string;
  operation: ItineraryOperation;
  queuedAt: number;
  /** True for a change replayed after the app was closed and reopened. */
  resumed?: boolean;
}

export function describeOperation(operation: ItineraryOperation): string {
  switch (operation.kind) {
    case 'reorder':
      return 'จัดลำดับสถานที่';
    case 'addStop':
      return `เพิ่ม “${operation.stop.name}”`;
    case 'saveStop':
      return `บันทึก “${operation.stop.name}”`;
    case 'saveDay':
      return 'บันทึกการตั้งค่าวัน';
    case 'deleteStop':
      return 'ลบสถานที่';
    case 'restoreStop':
      return `กู้คืน “${operation.stop.name}”`;
    case 'moveStop':
      return 'ย้ายสถานที่';
  }
}

/** The day whose `version` this change is checked against, if any. */
export function checkedAgainstDay(operation: ItineraryOperation): string | null {
  switch (operation.kind) {
    case 'reorder':
    case 'addStop':
    case 'saveStop':
    case 'saveDay':
      return operation.dayId;
    default:
      return null;
  }
}

/** Days this change bumps without reporting the new version. */
export function versionsInvalidatedBy(operation: ItineraryOperation): readonly string[] {
  return operation.kind === 'moveStop' ? [operation.fromDayId, operation.toDayId] : [];
}

/** What the itinerary looks like with this change already made. */
export function applyOperation(
  days: readonly ItineraryDayView[],
  operation: ItineraryOperation,
): ItineraryDayView[] {
  switch (operation.kind) {
    case 'reorder':
      return reorderStops(days, operation.dayId, operation.stopIds);
    case 'addStop':
      return insertStop(days, operation.dayId, operation.stop);
    case 'saveStop':
      return updateStop(days, operation.stopId, operation.stop, operation.leg);
    case 'saveDay':
      return updateDay(days, operation.dayId, operation.day);
    case 'deleteStop':
      return removeStop(days, operation.stopId);
    case 'restoreStop':
      return insertStop(days, operation.dayId, operation.stop);
    case 'moveStop':
      return moveStopToDay(days, operation.stopId, operation.toDayId);
  }
}
