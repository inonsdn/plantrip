import { describe, expect, it } from 'vitest';
import {
  balancesAreZeroSum,
  computeBalances,
  computeExpenseDebts,
  type CalcExpense,
  type CalcSettlement,
} from '@/lib/settlement';
import { computeSplits } from '@/lib/split';
import { convertToBaseMinor } from '@/lib/money';

const NON = 'non';
const MEW = 'mew';
const PRAEW = 'praew';
const MEMBERS = [NON, MEW, PRAEW];

function expense(
  id: string,
  payer: string | null,
  totalMinor: number,
  participants: string[],
  includedInSettlement = true,
): CalcExpense {
  return {
    id,
    payerMemberId: payer,
    baseAmountMinor: totalMinor,
    includedInSettlement,
    splits: computeSplits(
      'equal',
      totalMinor,
      participants.map((memberId) => ({ memberId })),
    ).map((line) => ({ memberId: line.memberId, amountMinor: line.amountMinor })),
  };
}

function net(balances: ReturnType<typeof computeBalances>, memberId: string): number {
  return balances.find((balance) => balance.memberId === memberId)!.netMinor;
}

describe('balances', () => {
  it('credits the payer and debits the beneficiaries', () => {
    const balances = computeBalances(MEMBERS, [expense('e1', NON, 30000, MEMBERS)]);
    expect(net(balances, NON)).toBe(20000);
    expect(net(balances, MEW)).toBe(-10000);
    expect(net(balances, PRAEW)).toBe(-10000);
    expect(balancesAreZeroSum(balances)).toBe(true);
  });

  it('handles a payer who is not a beneficiary', () => {
    const balances = computeBalances(MEMBERS, [expense('e1', NON, 20000, [MEW, PRAEW])]);
    expect(net(balances, NON)).toBe(20000);
    expect(net(balances, MEW)).toBe(-10000);
    expect(net(balances, PRAEW)).toBe(-10000);
  });

  it('counts an excluded expense in spending but never in debt', () => {
    const balances = computeBalances(MEMBERS, [
      expense('paid-before', NON, 60000, MEMBERS, false),
      expense('dinner', MEW, 30000, MEMBERS),
    ]);

    const nonBalance = balances.find((balance) => balance.memberId === NON)!;
    expect(nonBalance.paidMinor).toBe(60000);
    expect(nonBalance.spentMinor).toBe(20000 + 10000);
    expect(nonBalance.settlementPaidMinor).toBe(0);
    expect(nonBalance.settlementOwedMinor).toBe(10000);
    expect(nonBalance.netMinor).toBe(-10000);
    expect(balancesAreZeroSum(balances)).toBe(true);
  });

  it('treats "everyone paid their own fare" as no debt at all', () => {
    const own: CalcExpense = {
      id: 'mrt',
      payerMemberId: null,
      baseAmountMinor: 9000,
      includedInSettlement: false,
      splits: MEMBERS.map((memberId) => ({ memberId, amountMinor: 3000 })),
    };
    const balances = computeBalances(MEMBERS, [own]);
    expect(balances.every((balance) => balance.netMinor === 0)).toBe(true);
    expect(balances.every((balance) => balance.spentMinor === 3000)).toBe(true);
  });

  it('applies recorded settlement payments', () => {
    const expenses = [expense('e1', NON, 30000, MEMBERS)];
    const settlements: CalcSettlement[] = [
      { fromMemberId: MEW, toMemberId: NON, amountMinor: 10000, status: 'paid' },
      { fromMemberId: PRAEW, toMemberId: NON, amountMinor: 10000, status: 'cancelled' },
    ];
    const balances = computeBalances(MEMBERS, expenses, settlements);
    expect(net(balances, MEW)).toBe(0);
    expect(net(balances, PRAEW)).toBe(-10000);
    expect(net(balances, NON)).toBe(10000);
    expect(balancesAreZeroSum(balances)).toBe(true);
  });

  it('nets to zero across a messy three-member trip', () => {
    const balances = computeBalances(MEMBERS, [
      expense('hotel', NON, 100_00, MEMBERS),
      expense('tickets', MEW, 777_77, [MEW, PRAEW]),
      expense('snacks', PRAEW, 10_01, MEMBERS),
      expense('personal', MEW, 45_00, [MEW]),
    ]);
    expect(balancesAreZeroSum(balances)).toBe(true);
  });
});

describe('editing and deleting an expense', () => {
  const base = [expense('hotel', NON, 90000, MEMBERS), expense('dinner', MEW, 30000, MEMBERS)];

  it('reflects an edited amount immediately', () => {
    const before = computeBalances(MEMBERS, base);
    expect(net(before, NON)).toBe(60000 - 10000);

    const edited = [expense('hotel', NON, 60000, MEMBERS), base[1]];
    const after = computeBalances(MEMBERS, edited);
    expect(net(after, NON)).toBe(40000 - 10000);
    expect(balancesAreZeroSum(after)).toBe(true);
  });

  it('removes the debt when an expense is deleted', () => {
    const after = computeBalances(MEMBERS, [base[0]]);
    expect(net(after, MEW)).toBe(-30000);
    expect(balancesAreZeroSum(after)).toBe(true);
  });
});

describe('multi-currency trip', () => {
  it('settles in the base currency using each expense own rate', () => {
    // 120 SGD hotel at 26, then 90 SGD dinner at a later rate of 25.5
    const hotel = convertToBaseMinor('120', 'SGD', '26', 'THB');
    const dinner = convertToBaseMinor('90', 'SGD', '25.5', 'THB');
    expect(hotel).toBe(312000);
    expect(dinner).toBe(229500);

    const balances = computeBalances(MEMBERS, [
      expense('hotel', NON, hotel, MEMBERS),
      expense('dinner', MEW, dinner, MEMBERS),
    ]);
    expect(balancesAreZeroSum(balances)).toBe(true);
    expect(net(balances, NON)).toBe(hotel - 104000 - 76500);
  });
});

describe('per-expense debts', () => {
  it('lists one row per member who owes the payer', () => {
    const debts = computeExpenseDebts([expense('hotel', NON, 30000, MEMBERS)]);
    expect(debts).toEqual([
      { expenseId: 'hotel', fromMemberId: MEW, toMemberId: NON, amountMinor: 10000 },
      { expenseId: 'hotel', fromMemberId: PRAEW, toMemberId: NON, amountMinor: 10000 },
    ]);
  });

  it('never bills the payer for their own share', () => {
    const debts = computeExpenseDebts([expense('lunch', NON, 30000, MEMBERS)]);
    expect(debts.some((debt) => debt.fromMemberId === NON)).toBe(false);
  });

  it('keeps each expense separate instead of netting them', () => {
    // Non pays for one, Mew pays for another: two debts, opposite directions,
    // where simplifyDebts would collapse them into a single smaller transfer.
    const debts = computeExpenseDebts([
      expense('a', NON, 20000, [NON, MEW]),
      expense('b', MEW, 10000, [NON, MEW]),
    ]);
    expect(debts).toEqual([
      { expenseId: 'a', fromMemberId: MEW, toMemberId: NON, amountMinor: 10000 },
      { expenseId: 'b', fromMemberId: NON, toMemberId: MEW, amountMinor: 5000 },
    ]);
  });

  it('skips expenses excluded from settlement and ones with no payer', () => {
    expect(computeExpenseDebts([expense('flight', NON, 30000, MEMBERS, false)])).toEqual([]);
    expect(
      computeExpenseDebts([
        {
          id: 'mrt',
          payerMemberId: null,
          baseAmountMinor: 9000,
          includedInSettlement: false,
          splits: MEMBERS.map((memberId) => ({ memberId, amountMinor: 3000 })),
        },
      ]),
    ).toEqual([]);
  });

  it('skips a personal expense, which owes nobody', () => {
    expect(computeExpenseDebts([expense('dessert', MEW, 4500, [MEW])])).toEqual([]);
  });

  it('adds up to the same money as the netted balances', () => {
    const expenses = [
      expense('hotel', NON, 30000, MEMBERS),
      expense('tickets', MEW, 77777, [MEW, PRAEW]),
    ];
    const debts = computeExpenseDebts(expenses);

    // Settling every row individually must clear everyone, exactly as the
    // simplified transfers do.
    const after = computeBalances(
      MEMBERS,
      expenses,
      debts.map((debt) => ({ ...debt, status: 'paid' as const })),
    );
    expect(after.every((balance) => balance.netMinor === 0)).toBe(true);
  });
});
