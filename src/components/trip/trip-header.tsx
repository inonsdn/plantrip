'use client';

import { CalendarDays, Loader2, MapPin, Users } from 'lucide-react';
import { ShareLinkButton } from './share-link';
import { useTripUi } from './trip-shell';
import { formatDateRange } from '@/lib/format';

export function TripHeader() {
  const { context, openShare, pendingChanges } = useTripUi();
  const { trip, members } = context;

  return (
    // Compact on a phone, where every row it takes is a row the plan does not
    // get: one line of title, one line of facts, and nothing wraps to a third.
    <div className="flex items-center justify-between gap-2 pb-3">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-lg font-bold leading-tight text-ink sm:text-2xl">
          <span className="min-w-0 truncate">{trip.name}</span>
          {/*
            The only sign that anything is still in flight. It sits here rather
            than on the thing being edited so that nothing on the list moves,
            disables itself or takes focus while a save is on its way.
          */}
          {pendingChanges > 0 ? (
            <span
              role="status"
              aria-label={`กำลังบันทึก ${pendingChanges} รายการ`}
              title={`กำลังบันทึก ${pendingChanges} รายการ`}
              className="shrink-0 text-brand"
            >
              <Loader2 aria-hidden className="size-4 animate-spin" />
            </span>
          ) : null}
        </h1>
        {/* The destination is the one part that can be any length, so it is
            the one part that gives way. */}
        <div className="mt-0.5 flex items-center gap-x-3 overflow-hidden text-xs text-muted sm:mt-1 sm:gap-x-4 sm:text-sm">
          {trip.destination ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden className="size-3.5 shrink-0 sm:size-4" />
              <span className="truncate">{trip.destination}</span>
            </span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1">
            <CalendarDays aria-hidden className="size-3.5 sm:size-4" />
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Users aria-hidden className="size-3.5 sm:size-4" />
            {members.length} คน
          </span>
        </div>
      </div>
      <div className="shrink-0">
        <ShareLinkButton onClick={openShare} iconOnly />
      </div>
    </div>
  );
}
