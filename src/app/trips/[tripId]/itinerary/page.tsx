import { notFound } from 'next/navigation';
import { ItineraryPlanner } from '@/components/itinerary/itinerary-planner';
import { ItineraryDaySetup } from '@/components/itinerary/day-setup';
import { getTripContext } from '@/lib/queries/trips';
import { getItinerary } from '@/lib/queries/itinerary';
import { parseDateOnly, toDateOnly } from '@/lib/format';

export const metadata = { title: 'แผนการเดินทาง' };

/** Every date the trip covers, inclusive. Empty when the trip has no dates. */
function tripDates(start: string | null, end: string | null): string[] {
  if (!start) return [];
  const first = parseDateOnly(start);
  const last = parseDateOnly(end ?? start);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return [];

  const dates: string[] = [];
  for (
    let cursor = new Date(first);
    cursor <= last && dates.length < 90;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(toDateOnly(cursor));
  }
  return dates;
}

export default async function TripItineraryPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const context = await getTripContext(tripId);
  if (!context) notFound();

  const days = await getItinerary(tripId);
  const existing = new Set(days.map((day) => day.localDate));
  const missing = tripDates(context.trip.startDate, context.trip.endDate).filter(
    (date) => !existing.has(date),
  );

  return (
    <div className="space-y-3">
      <ItineraryDaySetup
        tripId={tripId}
        missingDates={missing}
        hasDates={context.trip.startDate !== null}
        hasDays={days.length > 0}
      />
      <ItineraryPlanner tripId={tripId} days={days} />
    </div>
  );
}
