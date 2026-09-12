import { categoryMeta } from './categories';
import { computeBalances, type CalcExpense, type CalcSettlement, type MemberBalance } from './settlement';
import type { ExpenseView, SettlementView } from './types';

export interface CategoryTotal {
  category: string;
  label: string;
  barClass: string;
  amountMinor: number;
  /** 0–1, relative to the trip total. */
  share: number;
}

export interface DayTotal {
  /** `YYYY-MM-DD` */
  date: string;
  tripDay: number | null;
  amountMinor: number;
  count: number;
}

export interface TripStats {
  totalMinor: number;
  /** Total without anything dated before the trip start / marked day 0. */
  totalExcludingPreTripMinor: number;
  preTripMinor: number;
  settlementTotalMinor: number;
  excludedFromSettlementMinor: number;
  expenseCount: number;
  byCategory: CategoryTotal[];
  byDay: DayTotal[];
  balances: MemberBalance[];
  outstandingMinor: number;
}

function isPreTripExpense(expense: ExpenseView, tripStartDate: string | null): boolean {
  if (expense.tripDay === 0) return true;
  if (!tripStartDate) return false;
  return expense.expenseDate < tripStartDate;
}

export function toCalcExpense(expense: ExpenseView): CalcExpense {
  return {
    id: expense.id,
    payerMemberId: expense.payerMemberId,
    baseAmountMinor: expense.baseAmountMinor,
    includedInSettlement: expense.includedInSettlement,
    splits: expense.splits.map((split) => ({
      memberId: split.memberId,
      amountMinor: split.amountMinor,
    })),
  };
}

export function toCalcSettlement(settlement: SettlementView): CalcSettlement {
  return {
    id: settlement.id,
    fromMemberId: settlement.fromMemberId,
    toMemberId: settlement.toMemberId,
    amountMinor: settlement.amountMinor,
    status: settlement.status,
  };
}

/**
 * Category totals, either for the whole trip or for one member's own share.
 *
 * With a memberId the amount is that member's split of each expense, and the
 * share percentages are relative to their own total rather than the trip's.
 */
export function computeCategoryTotals(
  expenses: readonly ExpenseView[],
  memberId?: string | null,
): CategoryTotal[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const expense of expenses) {
    const amountMinor = memberId
      ? expense.splits
          .filter((split) => split.memberId === memberId)
          .reduce((total, split) => total + split.amountMinor, 0)
      : expense.baseAmountMinor;

    if (amountMinor === 0) continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + amountMinor);
    grandTotal += amountMinor;
  }

  return [...totals.entries()]
    .map(([category, amountMinor]) => {
      const meta = categoryMeta(category);
      return {
        category,
        label: meta.label,
        barClass: meta.barClass,
        amountMinor,
        share: grandTotal > 0 ? amountMinor / grandTotal : 0,
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor || a.category.localeCompare(b.category));
}

export function computeTripStats(
  expenses: readonly ExpenseView[],
  memberIds: readonly string[],
  settlements: readonly SettlementView[],
  tripStartDate: string | null,
): TripStats {
  let totalMinor = 0;
  let preTripMinor = 0;
  let settlementTotalMinor = 0;

  const dayTotals = new Map<string, DayTotal>();

  for (const expense of expenses) {
    totalMinor += expense.baseAmountMinor;
    if (isPreTripExpense(expense, tripStartDate)) preTripMinor += expense.baseAmountMinor;
    if (expense.includedInSettlement) settlementTotalMinor += expense.baseAmountMinor;

    const day = dayTotals.get(expense.expenseDate) ?? {
      date: expense.expenseDate,
      tripDay: expense.tripDay,
      amountMinor: 0,
      count: 0,
    };
    day.amountMinor += expense.baseAmountMinor;
    day.count += 1;
    if (day.tripDay === null) day.tripDay = expense.tripDay;
    dayTotals.set(expense.expenseDate, day);
  }

  const byCategory = computeCategoryTotals(expenses);

  const byDay = [...dayTotals.values()].sort((a, b) => a.date.localeCompare(b.date));

  const balances = computeBalances(
    memberIds,
    expenses.map(toCalcExpense),
    settlements.map(toCalcSettlement),
  );

  const outstandingMinor = balances.reduce(
    (total, balance) => total + Math.max(balance.netMinor, 0),
    0,
  );

  return {
    totalMinor,
    totalExcludingPreTripMinor: totalMinor - preTripMinor,
    preTripMinor,
    settlementTotalMinor,
    excludedFromSettlementMinor: totalMinor - settlementTotalMinor,
    expenseCount: expenses.length,
    byCategory,
    byDay,
    balances,
    outstandingMinor,
  };
}
