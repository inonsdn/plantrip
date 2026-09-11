/**
 * Hand-maintained mirror of supabase/migrations. Keep in sync when the schema
 * changes (or regenerate with `supabase gen types typescript`).
 */

export type TripMemberRole = 'owner' | 'member';
export type SplitMethodDb = 'equal' | 'exact' | 'percent' | 'shares' | 'personal';
export type SettlementStatusDb = 'pending' | 'paid' | 'cancelled';

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type TripRow = {
  id: string;
  owner_id: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  base_currency: string;
  invite_token: string;
  invite_token_created_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TripCurrencyRow = {
  id: string;
  trip_id: string;
  currency_code: string;
  default_exchange_rate: string;
  created_at: string;
  updated_at: string;
}

export type TripMemberRow = {
  id: string;
  trip_id: string;
  user_id: string | null;
  display_name: string;
  role: TripMemberRole;
  joined_at: string;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseRow = {
  id: string;
  trip_id: string;
  description: string;
  category: string;
  expense_date: string;
  trip_day: number | null;
  original_amount: string;
  currency_code: string;
  exchange_rate: string;
  base_amount: string;
  payer_member_id: string | null;
  included_in_settlement: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseSplitRow = {
  id: string;
  expense_id: string;
  trip_id: string;
  member_id: string;
  split_method: SplitMethodDb;
  share_value: string | null;
  amount_base: string;
  created_at: string;
  updated_at: string;
}

export type SettlementRow = {
  id: string;
  trip_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_base: string;
  status: SettlementStatusDb;
  paid_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TripPreviewRow = {
  trip_id: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  base_currency: string;
  member_count: number;
  owner_display_name: string | null;
  already_member: boolean;
}

type Timestamps = 'created_at' | 'updated_at';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, Timestamps | 'avatar_url' | 'display_name'> &
          Partial<Pick<ProfileRow, 'avatar_url' | 'display_name'>>;
        Update: Partial<Omit<ProfileRow, 'id'>>;
        Relationships: [];
      };
      trips: {
        Row: TripRow;
        Insert: Pick<TripRow, 'owner_id' | 'name'> & Partial<Omit<TripRow, 'owner_id' | 'name'>>;
        Update: Partial<Omit<TripRow, 'id'>>;
        Relationships: [];
      };
      trip_currencies: {
        Row: TripCurrencyRow;
        Insert: Pick<TripCurrencyRow, 'trip_id' | 'currency_code'> &
          Partial<Omit<TripCurrencyRow, 'trip_id' | 'currency_code'>>;
        Update: Partial<Omit<TripCurrencyRow, 'id'>>;
        Relationships: [];
      };
      trip_members: {
        Row: TripMemberRow;
        Insert: Pick<TripMemberRow, 'trip_id' | 'display_name'> &
          Partial<Omit<TripMemberRow, 'trip_id' | 'display_name'>>;
        Update: Partial<Omit<TripMemberRow, 'id'>>;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: Pick<
          ExpenseRow,
          'trip_id' | 'description' | 'original_amount' | 'currency_code' | 'base_amount'
        > &
          Partial<Omit<ExpenseRow, 'trip_id' | 'description'>>;
        Update: Partial<Omit<ExpenseRow, 'id'>>;
        Relationships: [];
      };
      expense_splits: {
        Row: ExpenseSplitRow;
        Insert: Pick<
          ExpenseSplitRow,
          'expense_id' | 'trip_id' | 'member_id' | 'amount_base'
        > &
          Partial<Omit<ExpenseSplitRow, 'expense_id' | 'trip_id' | 'member_id' | 'amount_base'>>;
        Update: Partial<Omit<ExpenseSplitRow, 'id'>>;
        Relationships: [];
      };
      settlements: {
        Row: SettlementRow;
        Insert: Pick<
          SettlementRow,
          'trip_id' | 'from_member_id' | 'to_member_id' | 'amount_base'
        > &
          Partial<Omit<SettlementRow, 'trip_id' | 'from_member_id' | 'to_member_id' | 'amount_base'>>;
        Update: Partial<Omit<SettlementRow, 'id'>>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_trip: {
        Args: {
          p_name: string;
          p_destination?: string;
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_base_currency?: string;
          p_owner_display_name?: string | null;
          p_secondary_currency?: string | null;
          p_secondary_rate?: number | string | null;
        };
        Returns: string;
      };
      trip_preview_by_token: {
        Args: { p_token: string };
        Returns: TripPreviewRow[];
      };
      join_trip_by_token: {
        Args: { p_token: string; p_display_name?: string | null };
        Returns: string;
      };
      regenerate_invite_token: {
        Args: { p_trip_id: string };
        Returns: string;
      };
      remove_trip_member: {
        Args: { p_member_id: string };
        Returns: undefined;
      };
      leave_trip: {
        Args: { p_trip_id: string };
        Returns: undefined;
      };
      delete_trip: {
        Args: { p_trip_id: string };
        Returns: undefined;
      };
      add_trip_member: {
        Args: { p_trip_id: string; p_display_name: string };
        Returns: string;
      };
      claim_trip_member: {
        Args: { p_placeholder_id: string; p_joined_member_id: string };
        Returns: undefined;
      };
      save_expense: {
        Args: { p_payload: Record<string, unknown> };
        Returns: string;
      };
    };
    Enums: {
      trip_member_role: TripMemberRole;
      split_method: SplitMethodDb;
      settlement_status: SettlementStatusDb;
    };
    CompositeTypes: Record<never, never>;
  };
}
