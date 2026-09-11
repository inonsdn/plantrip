import { describe, expect, it } from 'vitest';
import {
  balancesAreZeroSum,
  computeBalances,
  simplifyDebts,
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

describe('debt simplification', () => {
  it('produces direct instructions, fewest transfers', () => {
    const balances = computeBalances(MEMBERS, [expense('e1', NON, 30000, MEMBERS)]);
    const transfers = simplifyDebts(balances);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((transfer) => transfer.toMemberId === NON)).toBe(true);
    expect(transfers.reduce((sum, transfer) => sum + transfer.amountMinor, 0)).toBe(20000);
  });

  it('collapses a debt chain into a single transfer', () => {
    // A owes B, B owes C the same amount -> A pays C once.
    const balances = computeBalances(['a', 'b', 'c'], [
      { id: '1', payerMemberId: 'b', baseAmountMinor: 1000, includedInSettlement: true, splits: [{ memberId: 'a', amountMinor: 1000 }] },
      { id: '2', payerMemberId: 'c', baseAmountMinor: 1000, includedInSettlement: true, splits: [{ memberId: 'b', amountMinor: 1000 }] },
    ]);
    const transfers = simplifyDebts(balances);
    expect(transfers).toEqual([{ fromMemberId: 'a', toMemberId: 'c', amountMinor: 1000 }]);
  });

  it('never exceeds members - 1 transfers and always clears every balance', () => {
    const balances = computeBalances(MEMBERS, [
      expense('hotel', NON, 100_00, MEMBERS),
      expense('tickets', MEW, 777_77, [MEW, PRAEW]),
      expense('snacks', PRAEW, 10_01, MEMBERS),
    ]);
    const transfers = simplifyDebts(balances);
    expect(transfers.length).toBeLessThanOrEqual(MEMBERS.length - 1);

    const after = computeBalances(
      MEMBERS,
      [
        expense('hotel', NON, 100_00, MEMBERS),
        expense('tickets', MEW, 777_77, [MEW, PRAEW]),
        expense('snacks', PRAEW, 10_01, MEMBERS),
      ],
      transfers.map((transfer) => ({ ...transfer, status: 'paid' as const })),
    );
    expect(after.every((balance) => balance.netMinor === 0)).toBe(true);
  });

  it('is empty when everyone is square', () => {
    const balances = computeBalances(MEMBERS, []);
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it('is deterministic', () => {
    const build = () =>
      computeBalances(MEMBERS, [
        expense('a', NON, 33_33, MEMBERS),
        expense('b', MEW, 66_67, MEMBERS),
      ]);
    expect(simplifyDebts(build())).toEqual(simplifyDebts(build()));
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
