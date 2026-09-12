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

/** One member's debt to the payer of a single expense. */
export interface ExpenseDebt {
  expenseId: string;
  /** Owes the money. */
  fromMemberId: string;
  /** Paid for the expense. */
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

/** Net balances must always cancel out; used by tests and as a runtime guard. */
export function balancesAreZeroSum(balances: readonly MemberBalance[]): boolean {
  return balances.reduce((total, balance) => total + balance.netMinor, 0) === 0;
}

/**
 * Every debt an expense creates, one row per member who owes its payer.
 *
 * Unlike simplifyDebts this nets nothing: each expense is listed on its own so
 * it can be settled individually. Expenses excluded from settlement, and the
 * payer's own share, produce no rows.
 */
export function computeExpenseDebts(expenses: readonly CalcExpense[]): ExpenseDebt[] {
  const debts: ExpenseDebt[] = [];

  for (const expense of expenses) {
    if (!expense.includedInSettlement) continue;
    const payer = expense.payerMemberId;
    if (!payer) continue;

    for (const split of expense.splits) {
      if (split.memberId === payer) continue;
      if (split.amountMinor <= 0) continue;
      debts.push({
        expenseId: expense.id,
        fromMemberId: split.memberId,
        toMemberId: payer,
        amountMinor: split.amountMinor,
      });
    }
  }

  return debts;
}
