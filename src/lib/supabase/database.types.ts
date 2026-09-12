/**
 * Hand-maintained mirror of supabase/migrations. Keep in sync when the schema
 * changes (or regenerate with `supabase gen types typescript`).
 */

/**
 * A Postgres `numeric` column. PostgREST sends these as JSON numbers, so the
 * runtime type is number even though the column holds a fixed-point decimal.
 * Pass them through numericToString() before treating one as text.
 */
export type DbNumeric = string | number;

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
  default_exchange_rate: DbNumeric;
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
  itinerary_day_id: string | null;
  itinerary_origin_stop_id: string | null;
  itinerary_destination_stop_id: string | null;
  id: string;
  trip_id: string;
  description: string;
  category: string;
  expense_date: string;
  trip_day: number | null;
  original_amount: DbNumeric;
  currency_code: string;
  exchange_rate: DbNumeric;
  base_amount: DbNumeric;
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
  share_value: DbNumeric | null;
  amount_base: DbNumeric;
  created_at: string;
  updated_at: string;
}

export type TransportModeDb = 'driving' | 'transit' | 'walking';

export type ItineraryDayRow = {
  id: string;
  trip_id: string;
  local_date: string;
  start_local_time: string;
  time_zone: string;
  default_transport_mode: TransportModeDb;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ItineraryStopRow = {
  id: string;
  day_id: string;
  trip_id: string;
  position: number;
  place_provider: string;
  place_id: string | null;
  name: string;
  address: string | null;
  latitude: DbNumeric;
  longitude: DbNumeric;
  visit_duration_minutes: number;
  not_before_local_time: string | null;
  enabled: boolean;
  notes: string | null;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ItineraryLegPreferenceRow = {
  id: string;
  day_id: string;
  trip_id: string;
  origin_stop_id: string;
  destination_stop_id: string;
  transport_mode: TransportModeDb;
  selected_route_reference: string | null;
  manual_duration_minutes: number | null;
  visible_on_map: boolean;
  created_at: string;
  updated_at: string;
};

export type SettlementRow = {
  id: string;
  trip_id: string;
  /** Set when this payment settles one specific expense. */
  expense_id: string | null;
  from_member_id: string;
  to_member_id: string;
  amount_base: DbNumeric;
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
      itinerary_days: {
        Row: ItineraryDayRow;
        Insert: Pick<ItineraryDayRow, 'trip_id' | 'local_date'> &
          Partial<Omit<ItineraryDayRow, 'trip_id' | 'local_date'>>;
        Update: Partial<Omit<ItineraryDayRow, 'id'>>;
        Relationships: [];
      };
      itinerary_stops: {
        Row: ItineraryStopRow;
        Insert: Pick<
          ItineraryStopRow,
          'day_id' | 'trip_id' | 'name' | 'latitude' | 'longitude'
        > &
          Partial<Omit<ItineraryStopRow, 'day_id' | 'trip_id' | 'name'>>;
        Update: Partial<Omit<ItineraryStopRow, 'id'>>;
        Relationships: [];
      };
      itinerary_leg_preferences: {
        Row: ItineraryLegPreferenceRow;
        Insert: Pick<
          ItineraryLegPreferenceRow,
          'day_id' | 'trip_id' | 'origin_stop_id' | 'destination_stop_id' | 'transport_mode'
        > &
          Partial<Omit<ItineraryLegPreferenceRow, 'day_id' | 'trip_id'>>;
        Update: Partial<Omit<ItineraryLegPreferenceRow, 'id'>>;
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
      consume_itinerary_budget: {
        Args: { p_daily_limit: number };
        Returns: boolean;
      };
      bump_itinerary_day: {
        Args: { p_day_id: string; p_expected_version?: number | null };
        Returns: number;
      };
      reorder_itinerary_stops: {
        Args: { p_day_id: string; p_stop_ids: string[]; p_expected_version?: number | null };
        Returns: number;
      };
      move_itinerary_stop: {
        Args: { p_stop_id: string; p_target_day_id: string; p_expected_version?: number | null };
        Returns: number;
      };
      save_expense: {
        Args: { p_payload: Record<string, unknown> };
        Returns: string;
      };
    };
    Enums: {
      transport_mode: TransportModeDb;
      trip_member_role: TripMemberRole;
      split_method: SplitMethodDb;
      settlement_status: SettlementStatusDb;
    };
    CompositeTypes: Record<never, never>;
  };
}
