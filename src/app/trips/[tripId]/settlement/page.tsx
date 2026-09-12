import { notFound } from 'next/navigation';
import { SettlementPanel } from '@/components/trip/settlement-panel';
import { getTripContext } from '@/lib/queries/trips';
import { listExpenses, listSettlements } from '@/lib/queries/expenses';
import { balancesAreZeroSum, computeBalances, computeExpenseDebts } from '@/lib/settlement';
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

  // Every expense debt listed on its own so each can be settled individually.
  const debts = computeExpenseDebts(expenses.map(toCalcExpense));
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));

  const items = debts
    .map((debt) => {
      const expense = expenseById.get(debt.expenseId);
      if (!expense) return null;
      // A pending claim counts as live: it blocks a second claim and shows as
      // "waiting for the receiver", but balances still ignore it.
      const settlement = settlements.find(
        (candidate) =>
          candidate.status !== 'cancelled' &&
          candidate.expenseId === debt.expenseId &&
          candidate.fromMemberId === debt.fromMemberId &&
          candidate.toMemberId === debt.toMemberId,
      );
      const receiver = context.allMembers.find((member) => member.id === debt.toMemberId);
      return {
        ...debt,
        description: expense.description,
        category: expense.category,
        expenseDate: expense.expenseDate,
        settlementId: settlement?.id ?? null,
        settlementStatus: settlement?.status === 'paid' ? ('paid' as const) : settlement ? ('pending' as const) : null,
        // Only the receiver confirms money arrived; a name with no account
        // behind it needs someone else to keep its books.
        canConfirm: receiver ? receiver.userId === null || receiver.isMe : false,
        receiverName: receiver?.displayName ?? '',
      };
    })
    .filter((item) => item !== null)
    .sort(
      (a, b) =>
        b.expenseDate.localeCompare(a.expenseDate) || a.expenseId.localeCompare(b.expenseId),
    );

  return (
    <SettlementPanel
      context={context}
      balances={balances}
      items={items}
      settlements={settlements}
      zeroSum={balancesAreZeroSum(balances)}
    />
  );
}
