import { notFound } from 'next/navigation';
import { TripDashboard } from '@/components/trip/dashboard';
import { getTripContext } from '@/lib/queries/trips';
import { listExpenses, listSettlements } from '@/lib/queries/expenses';
import { computeCategoryTotals, computeTripStats } from '@/lib/trip-stats';

export default async function TripDashboardPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const context = await getTripContext(tripId);
  if (!context) notFound();

  const [expenses, settlements] = await Promise.all([
    listExpenses(tripId, context.trip.baseCurrency),
    listSettlements(tripId, context.trip.baseCurrency),
  ]);

  const stats = computeTripStats(
    expenses,
    context.members.map((member) => member.id),
    settlements,
    context.trip.startDate,
  );

  return (
    <TripDashboard
      context={context}
      stats={stats}
      myCategoryTotals={computeCategoryTotals(expenses, context.currentMember.id)}
      recentExpenses={expenses.slice(0, 6)}
    />
  );
}
