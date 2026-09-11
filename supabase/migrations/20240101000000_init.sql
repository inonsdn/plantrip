-- TripMate :: core schema
-- All monetary values use numeric (fixed decimal). Never float.

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Unguessable invite token (base64url of 24 random bytes).
create or replace function public.generate_invite_token()
returns text
language sql
volatile
as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Keep a profile row in sync with auth.users so member lists can show names
-- without ever exposing auth.users (and therefore e-mail) to clients.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'traveller'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end,
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------

create table public.trips (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  destination text not null default '' check (char_length(destination) <= 160),
  start_date date,
  end_date date,
  base_currency text not null default 'THB'
    check (base_currency ~ '^[A-Z]{3}$'),
  invite_token text not null unique default public.generate_invite_token(),
  invite_token_created_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_date_range_valid
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index trips_owner_id_idx on public.trips (owner_id);
create index trips_invite_token_idx on public.trips (invite_token) where deleted_at is null;

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- trip_currencies
-- ---------------------------------------------------------------------------

create table public.trip_currencies (
  id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  default_exchange_rate numeric(20, 8) not null default 1
    check (default_exchange_rate > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, currency_code)
);

create index trip_currencies_trip_id_idx on public.trip_currencies (trip_id);

create trigger trip_currencies_set_updated_at
  before update on public.trip_currencies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------------

create type public.trip_member_role as enum ('owner', 'member');

create table public.trip_members (
  id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  role public.trip_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- lets child tables enforce "same trip" through a composite foreign key
  unique (id, trip_id)
);

-- one active membership per user per trip
create unique index trip_members_active_unique
  on public.trip_members (trip_id, user_id)
  where removed_at is null and user_id is not null;

create index trip_members_trip_id_idx on public.trip_members (trip_id);
create index trip_members_user_id_idx on public.trip_members (user_id) where removed_at is null;

create trigger trip_members_set_updated_at
  before update on public.trip_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  category text not null default 'other'
    check (category in (
      'food', 'dessert', 'drinks', 'transport', 'lodging',
      'tickets', 'shopping', 'souvenir', 'other'
    )),
  expense_date date not null default (now() at time zone 'utc')::date,
  trip_day integer check (trip_day is null or trip_day between 0 and 365),
  original_amount numeric(16, 2) not null check (original_amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20, 8) not null default 1 check (exchange_rate > 0),
  base_amount numeric(16, 2) not null check (base_amount > 0),
  payer_member_id uuid,
  included_in_settlement boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trip_id),
  -- "everyone paid their own share" rows can never create debt
  constraint expenses_payer_required_for_settlement
    check (payer_member_id is not null or included_in_settlement = false),
  -- payer must be a member of the very same trip
  constraint expenses_payer_same_trip
    foreign key (payer_member_id, trip_id)
    references public.trip_members (id, trip_id)
    on delete restrict
);

create index expenses_trip_id_idx on public.expenses (trip_id) where deleted_at is null;
create index expenses_trip_date_idx on public.expenses (trip_id, expense_date desc) where deleted_at is null;
create index expenses_payer_idx on public.expenses (payer_member_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- expense_splits
-- ---------------------------------------------------------------------------

create type public.split_method as enum ('equal', 'exact', 'percent', 'shares', 'personal');

create table public.expense_splits (
  id uuid primary key default extensions.gen_random_uuid(),
  expense_id uuid not null,
  trip_id uuid not null,
  member_id uuid not null,
  split_method public.split_method not null default 'equal',
  share_value numeric(16, 4) check (share_value is null or share_value >= 0),
  amount_base numeric(16, 2) not null check (amount_base >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expense_id, member_id),
  constraint expense_splits_expense_same_trip
    foreign key (expense_id, trip_id)
    references public.expenses (id, trip_id)
    on delete cascade,
  constraint expense_splits_member_same_trip
    foreign key (member_id, trip_id)
    references public.trip_members (id, trip_id)
    on delete restrict
);

create index expense_splits_expense_id_idx on public.expense_splits (expense_id);
create index expense_splits_trip_member_idx on public.expense_splits (trip_id, member_id);

create trigger expense_splits_set_updated_at
  before update on public.expense_splits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- settlements
-- ---------------------------------------------------------------------------

create type public.settlement_status as enum ('pending', 'paid', 'cancelled');

create table public.settlements (
  id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_member_id uuid not null,
  to_member_id uuid not null,
  amount_base numeric(16, 2) not null check (amount_base > 0),
  status public.settlement_status not null default 'paid',
  paid_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_distinct_parties check (from_member_id <> to_member_id),
  constraint settlements_from_same_trip
    foreign key (from_member_id, trip_id)
    references public.trip_members (id, trip_id)
    on delete restrict,
  constraint settlements_to_same_trip
    foreign key (to_member_id, trip_id)
    references public.trip_members (id, trip_id)
    on delete restrict
);

create index settlements_trip_id_idx on public.settlements (trip_id);
create index settlements_trip_status_idx on public.settlements (trip_id, status);

create trigger settlements_set_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();
