import { notFound } from 'next/navigation';
import { SettlementPanel } from '@/components/trip/settlement-panel';
import { getTripContext } from '@/lib/queries/trips';
import { listExpenses, listSettlements } from '@/lib/queries/expenses';
import { balancesAreZeroSum, computeBalances, simplifyDebts } from '@/lib/settlement';
import { toCalcExpense, toCalcSettlement } from '@/lib/trip-stats';

export const metadata = { title: 'ยอดโอน' };

export default async function TripSettlementPage({
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

  const balances = computeBalances(
    context.members.map((member) => member.id),
    expenses.map(toCalcExpense),
    settlements.map(toCalcSettlement),
  );

  return (
    <SettlementPanel
      context={context}
      balances={balances}
      transfers={simplifyDebts(balances)}
      settlements={settlements}
      zeroSum={balancesAreZeroSum(balances)}
    />
  );
}
