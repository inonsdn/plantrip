import 'server-only';
import { createSupabaseServerClient } from '../supabase/server';
import { numericToString, toMinorUnits } from '../money';
import type { ExpenseSplitView, ExpenseView, SettlementView } from '../types';

/** All live expenses of a trip, with their splits, newest first. */
export async function listExpenses(
  tripId: string,
  baseCurrency: string,
): Promise<ExpenseView[]> {
  const supabase = await createSupabaseServerClient();

  const [{ data: expenseRows, error }, { data: splitRows }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('expense_splits').select('*').eq('trip_id', tripId),
  ]);

  if (error) throw new Error(error.message);

  const splitsByExpense = new Map<string, ExpenseSplitView[]>();
  for (const split of splitRows ?? []) {
    const list = splitsByExpense.get(split.expense_id) ?? [];
    list.push({
      memberId: split.member_id,
      splitMethod: split.split_method,
      shareValue: split.share_value === null ? null : numericToString(split.share_value),
      amountMinor: toMinorUnits(split.amount_base, baseCurrency),
    });
    splitsByExpense.set(split.expense_id, list);
  }

  return (expenseRows ?? []).map((expense) => ({
    id: expense.id,
    description: expense.description,
    category: expense.category,
    expenseDate: expense.expense_date,
    tripDay: expense.trip_day,
    originalAmount: numericToString(expense.original_amount),
    currencyCode: expense.currency_code,
    exchangeRate: numericToString(expense.exchange_rate),
    baseAmountMinor: toMinorUnits(expense.base_amount, baseCurrency),
    payerMemberId: expense.payer_member_id,
    includedInSettlement: expense.included_in_settlement,
    notes: expense.notes,
    createdBy: expense.created_by,
    updatedBy: expense.updated_by,
    createdAt: expense.created_at,
    updatedAt: expense.updated_at,
    splits: splitsByExpense.get(expense.id) ?? [],
  }));
}

export async function listSettlements(
  tripId: string,
  baseCurrency: string,
): Promise<SettlementView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('settlements')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((settlement) => ({
    id: settlement.id,
    expenseId: settlement.expense_id,
    fromMemberId: settlement.from_member_id,
    toMemberId: settlement.to_member_id,
    amountMinor: toMinorUnits(settlement.amount_base, baseCurrency),
    status: settlement.status,
    paidAt: settlement.paid_at,
    note: settlement.note,
    createdAt: settlement.created_at,
  }));
}
