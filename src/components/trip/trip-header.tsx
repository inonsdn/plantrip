'use client';

import { CalendarDays, Loader2, MapPin, Users } from 'lucide-react';
import { ShareLinkButton } from './share-link';
import { useTripUi } from './trip-shell';
import { formatDateRange } from '@/lib/format';

export function TripHeader() {
  const { context, openShare, pendingChanges } = useTripUi();
  const { trip, members } = context;

  return (
    <div className="flex items-start justify-between gap-3 pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink sm:text-2xl">
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
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {trip.destination ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="size-4" />
              {trip.destination}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays aria-hidden className="size-4" />
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden className="size-4" />
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
