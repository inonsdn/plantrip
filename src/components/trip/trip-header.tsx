'use client';

import { CalendarDays, MapPin, Users } from 'lucide-react';
import { ShareLinkButton } from './share-link';
import { useTripUi } from './trip-shell';
import { formatDateRange } from '@/lib/format';

export function TripHeader() {
  const { context, openShare } = useTripUi();
  const { trip, members } = context;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{trip.name}</h1>
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
      <ShareLinkButton onClick={openShare} />
    </div>
  );
}
