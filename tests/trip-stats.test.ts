import { describe, expect, it } from 'vitest';
import {
  BASE_CURRENCY,
  MEMBER_IDS,
  MEW,
  NON,
  PRAEW,
  TRIP_START,
  buildSeedExpenses,
} from './fixtures/singapore-trip';
import { computeTripStats } from '@/lib/trip-stats';
import { balancesAreZeroSum, computeBalances, computeExpenseDebts } from '@/lib/settlement';
import { fromMinorUnits } from '@/lib/money';
import type { CalcSettlement } from '@/lib/settlement';
import { toCalcExpense } from '@/lib/trip-stats';

const expenses = buildSeedExpenses();

function balance(memberId: string, settlements: CalcSettlement[] = []) {
  return computeBalances(MEMBER_IDS, expenses.map(toCalcExpense), settlements).find(
    (item) => item.memberId === memberId,
  )!;
}

describe('Singapore demo trip totals', () => {
  const stats = computeTripStats(expenses, MEMBER_IDS, [], TRIP_START);

  it('totals every expense in the base currency', () => {
    // Verified independently: 24,000 + 14,040 + 2,509 + 4,316 + 300 + 1,638
    //                       +    325 +  1,170 + 3,120 +   890 = 52,308
    expect(fromMinorUnits(stats.totalMinor, BASE_CURRENCY)).toBe('52308.00');
    expect(stats.expenseCount).toBe(10);
  });

  it('separates the pre-trip flight from the on-trip spending', () => {
    expect(fromMinorUnits(stats.preTripMinor, BASE_CURRENCY)).toBe('24000.00');
    expect(fromMinorUnits(stats.totalExcludingPreTripMinor, BASE_CURRENCY)).toBe('28308.00');
  });

  it('keeps excluded expenses in the totals but out of the debts', () => {
    // Flight (24,000, already settled) + MRT (300, everyone paid their own).
    expect(fromMinorUnits(stats.excludedFromSettlementMinor, BASE_CURRENCY)).toBe('24300.00');
    expect(fromMinorUnits(stats.settlementTotalMinor, BASE_CURRENCY)).toBe('28008.00');
  });

  it('breaks spending down by category', () => {
    const byCategory = Object.fromEntries(
      stats.byCategory.map((item) => [item.category, fromMinorUnits(item.amountMinor, BASE_CURRENCY)]),
    );
    expect(byCategory).toEqual({
      transport: '24300.00',
      lodging: '14040.00',
      food: '7267.00',
      tickets: '4316.00',
      souvenir: '1170.00',
      drinks: '890.00',
      dessert: '325.00',
    });
    const sum = stats.byCategory.reduce((total, item) => total + item.amountMinor, 0);
    expect(sum).toBe(stats.totalMinor);
  });

  it('breaks spending down by day', () => {
    const byDay = Object.fromEntries(
      stats.byDay.map((day) => [day.date, fromMinorUnits(day.amountMinor, BASE_CURRENCY)]),
    );
    expect(byDay).toEqual({
      '2025-02-10': '24000.00',
      '2025-03-14': '16549.00',
      '2025-03-15': '6579.00',
      '2025-03-16': '5180.00',
    });
    const sum = stats.byDay.reduce((total, day) => total + day.amountMinor, 0);
    expect(sum).toBe(stats.totalMinor);
  });

  it('tracks what each member paid and used', () => {
    expect(fromMinorUnits(balance(NON).paidMinor, BASE_CURRENCY)).toBe('42798.00');
    expect(fromMinorUnits(balance(MEW).paidMinor, BASE_CURRENCY)).toBe('5531.00');
    expect(fromMinorUnits(balance(PRAEW).paidMinor, BASE_CURRENCY)).toBe('3679.00');

    const spentTotal = MEMBER_IDS.reduce((total, id) => total + balance(id).spentMinor, 0);
    expect(spentTotal).toBe(stats.totalMinor);
  });

  it('nets to zero', () => {
    expect(balancesAreZeroSum(stats.balances)).toBe(true);
  });

  it('lists each expense debt individually rather than netting them', () => {
    const debts = computeExpenseDebts(expenses.map(toCalcExpense));

    // The flight and the MRT fares create no debt; the two personal items owe
    // nobody; the Universal tickets owe only between มิว and แพรว.
    expect(debts.map((debt) => debt.expenseId)).toEqual([
      'hotel', 'hotel', 'dinner-day1', 'dinner-day1', 'uss',
      'lunch-day2', 'lunch-day2', 'dinner-day3', 'dinner-day3', 'drinks', 'drinks',
    ]);

    const uss = debts.filter((debt) => debt.expenseId === 'uss');
    expect(uss).toEqual([
      { expenseId: 'uss', fromMemberId: PRAEW, toMemberId: MEW, amountMinor: 215_800 },
    ]);
  });

  it('clears every balance once every item is marked paid', () => {
    const debts = computeExpenseDebts(expenses.map(toCalcExpense));
    const after = computeBalances(
      MEMBER_IDS,
      expenses.map(toCalcExpense),
      debts.map((debt) => ({ ...debt, status: 'paid' as const })),
    );
    expect(after.every((item) => item.netMinor === 0)).toBe(true);
  });

  it('leaves the rest outstanding when only one item is marked paid', () => {
    const debts = computeExpenseDebts(expenses.map(toCalcExpense));
    const [first, ...rest] = debts;
    const after = computeBalances(MEMBER_IDS, expenses.map(toCalcExpense), [
      { ...first, status: 'paid' },
    ]);

    expect(balancesAreZeroSum(after)).toBe(true);
    const stillOwed = rest.reduce((total, debt) => total + debt.amountMinor, 0);
    const outstanding = after.reduce(
      (total, balance) => total + Math.max(balance.netMinor, 0),
      0,
    );
    expect(outstanding).toBeLessThanOrEqual(stillOwed);
  });

  it('splits the shared dinner 2:1:1 and the two-person ticket in half', () => {
    const dinner = expenses.find((expense) => expense.id === 'dinner-day3')!;
    expect(dinner.splits.map((split) => split.amountMinor)).toEqual([156_000, 78_000, 78_000]);

    const uss = expenses.find((expense) => expense.id === 'uss')!;
    expect(uss.splits.map((split) => split.memberId)).toEqual([MEW, PRAEW]);
    expect(uss.splits.map((split) => split.amountMinor)).toEqual([215_800, 215_800]);
  });

  it('splits the indivisible dinner without losing a satang', () => {
    const dinner = expenses.find((expense) => expense.id === 'dinner-day1')!;
    expect(dinner.splits.map((split) => split.amountMinor)).toEqual([83_634, 83_633, 83_633]);
    expect(
      dinner.splits.reduce((total, split) => total + split.amountMinor, 0),
    ).toBe(dinner.baseAmountMinor);
  });

  it('gives every split of every expense back exactly the expense total', () => {
    for (const expense of expenses) {
      const sum = expense.splits.reduce((total, split) => total + split.amountMinor, 0);
      expect(sum).toBe(expense.baseAmountMinor);
    }
  });
});
