import { notFound } from 'next/navigation';
import { ExpenseList } from '@/components/expense/expense-list';
import { getTripContext } from '@/lib/queries/trips';
import { listExpenses } from '@/lib/queries/expenses';

export const metadata = { title: 'ค่าใช้จ่าย' };

export default async function TripExpensesPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const context = await getTripContext(tripId);
  if (!context) notFound();

  const expenses = await listExpenses(tripId, context.trip.baseCurrency);

  return <ExpenseList context={context} expenses={expenses} />;
}
