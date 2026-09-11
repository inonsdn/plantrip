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

export function computeTripStats(
  expenses: readonly ExpenseView[],
  memberIds: readonly string[],
  settlements: readonly SettlementView[],
  tripStartDate: string | null,
): TripStats {
  let totalMinor = 0;
  let preTripMinor = 0;
  let settlementTotalMinor = 0;

  const categoryTotals = new Map<string, number>();
  const dayTotals = new Map<string, DayTotal>();

  for (const expense of expenses) {
    totalMinor += expense.baseAmountMinor;
    if (isPreTripExpense(expense, tripStartDate)) preTripMinor += expense.baseAmountMinor;
    if (expense.includedInSettlement) settlementTotalMinor += expense.baseAmountMinor;

    categoryTotals.set(
      expense.category,
      (categoryTotals.get(expense.category) ?? 0) + expense.baseAmountMinor,
    );

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

  const byCategory: CategoryTotal[] = [...categoryTotals.entries()]
    .map(([category, amountMinor]) => {
      const meta = categoryMeta(category);
      return {
        category,
        label: meta.label,
        barClass: meta.barClass,
        amountMinor,
        share: totalMinor > 0 ? amountMinor / totalMinor : 0,
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor || a.category.localeCompare(b.category));

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
