import type { SettlementStatusDb, SplitMethodDb, TripMemberRole } from './supabase/database.types';

export interface TripMemberView {
  id: string;
  userId: string | null;
  displayName: string;
  role: TripMemberRole;
  removedAt: string | null;
  avatarUrl: string | null;
  isMe: boolean;
}

export interface TripCurrencyView {
  code: string;
  /** Decimal string, e.g. `26.00000000`. */
  rate: string;
}

export interface TripView {
  id: string;
  ownerId: string;
  name: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
  inviteToken: string;
  inviteTokenCreatedAt: string;
}

export interface TripContext {
  trip: TripView;
  /** Active members only — the ones an expense may be split with. */
  members: TripMemberView[];
  /** Including removed members, so historical rows still render a name. */
  allMembers: TripMemberView[];
  currentMember: TripMemberView;
  isOwner: boolean;
  currencies: TripCurrencyView[];
}

export interface ExpenseSplitView {
  memberId: string;
  splitMethod: SplitMethodDb;
  shareValue: string | null;
  amountMinor: number;
}

export interface ExpenseView {
  id: string;
  description: string;
  category: string;
  expenseDate: string;
  tripDay: number | null;
  originalAmount: string;
  currencyCode: string;
  exchangeRate: string;
  baseAmountMinor: number;
  payerMemberId: string | null;
  includedInSettlement: boolean;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  splits: ExpenseSplitView[];
}

export interface SettlementView {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  status: SettlementStatusDb;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface TripSummaryView {
  id: string;
  name: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
  memberCount: number;
  totalMinor: number;
  role: TripMemberRole;
}
