/**
 * Balance and debt-simplification maths.
 *
 * Every amount is an integer number of minor units in the trip base currency,
 * so these functions never touch floating point.
 */

export interface CalcSplit {
  memberId: string;
  amountMinor: number;
}

export interface CalcExpense {
  id: string;
  payerMemberId: string | null;
  baseAmountMinor: number;
  includedInSettlement: boolean;
  splits: CalcSplit[];
}

export type SettlementStatus = 'pending' | 'paid' | 'cancelled';

export interface CalcSettlement {
  id?: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  status: SettlementStatus;
}

export interface MemberBalance {
  memberId: string;
  /** Everything this member paid, excluded expenses included. */
  paidMinor: number;
  /** This member's share of every expense, excluded expenses included. */
  spentMinor: number;
  /** Paid, counting only expenses that affect settlement. */
  settlementPaidMinor: number;
  /** Owed, counting only expenses that affect settlement. */
  settlementOwedMinor: number;
  transfersOutMinor: number;
  transfersInMinor: number;
  /** Positive: should receive. Negative: should pay. */
  netMinor: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}

function emptyBalance(memberId: string): MemberBalance {
  return {
    memberId,
    paidMinor: 0,
    spentMinor: 0,
    settlementPaidMinor: 0,
    settlementOwedMinor: 0,
    transfersOutMinor: 0,
    transfersInMinor: 0,
    netMinor: 0,
  };
}

/**
 * Net balance per member.
 *
 * An expense flagged `includedInSettlement: false` still counts towards what a
 * member paid and spent (so the dashboard totals stay honest) but creates no
 * debt between members.
 */
export function computeBalances(
  memberIds: readonly string[],
  expenses: readonly CalcExpense[],
  settlements: readonly CalcSettlement[] = [],
): MemberBalance[] {
  const balances = new Map<string, MemberBalance>();
  const ensure = (memberId: string): MemberBalance => {
    let balance = balances.get(memberId);
    if (!balance) {
      balance = emptyBalance(memberId);
      balances.set(memberId, balance);
    }
    return balance;
  };

  for (const memberId of memberIds) ensure(memberId);

  for (const expense of expenses) {
    if (expense.payerMemberId) {
      const payer = ensure(expense.payerMemberId);
      payer.paidMinor += expense.baseAmountMinor;
      if (expense.includedInSettlement) {
        payer.settlementPaidMinor += expense.baseAmountMinor;
      }
    }
    for (const split of expense.splits) {
      const member = ensure(split.memberId);
      member.spentMinor += split.amountMinor;
      if (expense.includedInSettlement) {
        member.settlementOwedMinor += split.amountMinor;
      }
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== 'paid') continue;
    ensure(settlement.fromMemberId).transfersOutMinor += settlement.amountMinor;
    ensure(settlement.toMemberId).transfersInMinor += settlement.amountMinor;
  }

  for (const balance of balances.values()) {
    balance.netMinor =
      balance.settlementPaidMinor -
      balance.settlementOwedMinor +
      balance.transfersOutMinor -
      balance.transfersInMinor;
  }

  // Stable ordering: the member list first, then anyone only seen in history.
  const ordered: MemberBalance[] = [];
  const seen = new Set<string>();
  for (const memberId of memberIds) {
    const balance = balances.get(memberId);
    if (balance) {
      ordered.push(balance);
      seen.add(memberId);
    }
  }
  for (const [memberId, balance] of balances) {
    if (!seen.has(memberId)) ordered.push(balance);
  }
  return ordered;
}

/**
 * Greedy debt simplification: repeatedly settle the largest debtor against the
 * largest creditor. Produces at most `members - 1` transfers.
 *
 * Ordering is fully deterministic (amount desc, then member id asc) so the same
 * balances always yield the same instructions.
 */
export function simplifyDebts(balances: readonly MemberBalance[]): Transfer[] {
  const creditors = balances
    .filter((balance) => balance.netMinor > 0)
    .map((balance) => ({ memberId: balance.memberId, amount: balance.netMinor }))
    .sort((a, b) => b.amount - a.amount || a.memberId.localeCompare(b.memberId));

  const debtors = balances
    .filter((balance) => balance.netMinor < 0)
    .map((balance) => ({ memberId: balance.memberId, amount: -balance.netMinor }))
    .sort((a, b) => b.amount - a.amount || a.memberId.localeCompare(b.memberId));

  const transfers: Transfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountMinor: amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }

  return transfers;
}

/** Net balances must always cancel out; used by tests and as a runtime guard. */
export function balancesAreZeroSum(balances: readonly MemberBalance[]): boolean {
  return balances.reduce((total, balance) => total + balance.netMinor, 0) === 0;
}
