-- TripMate :: visual itinerary planner
--
-- Derived timing (arrival, departure, waiting) is deliberately NOT stored:
-- src/lib/itinerary/schedule.ts is the single authoritative calculation. Only
-- inputs live here.

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------

create type public.transport_mode as enum ('driving', 'transit', 'walking');

-- ---------------------------------------------------------------------------
-- itinerary_days
-- ---------------------------------------------------------------------------

create table public.itinerary_days (
  id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  local_date date not null,
  start_local_time time not null default '09:00',
  -- IANA zone; seeded from the trip destination where known, always editable.
  time_zone text not null default 'Asia/Bangkok'
    check (char_length(time_zone) between 1 and 64),
  default_transport_mode public.transport_mode not null default 'transit',
  -- Optimistic concurrency: every mutation of the day or its children bumps it.
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, local_date),
  -- lets child tables enforce "same trip" through a composite foreign key
  unique (id, trip_id)
);

create index itinerary_days_trip_idx on public.itinerary_days (trip_id, local_date);

create trigger itinerary_days_set_updated_at
  before update on public.itinerary_days
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- itinerary_stops
-- ---------------------------------------------------------------------------

create table public.itinerary_stops (
  id uuid primary key default extensions.gen_random_uuid(),
  day_id uuid not null,
  -- Denormalised so the composite keys below can pin everything to one trip.
  trip_id uuid not null,
  position integer not null check (position >= 0),
  place_provider text not null default 'manual'
    check (place_provider in ('manual', 'google', 'mapbox', 'maptiler', 'photon', 'nominatim')),
  place_id text,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  address text check (address is null or char_length(address) <= 400),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  visit_duration_minutes integer not null default 60
    check (visit_duration_minutes between 0 and 1440),
  -- "ถึงไม่ก่อนเวลา": wait instead of arriving early.
  not_before_local_time time,
  enabled boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  -- Soft delete so "เลิกทำ" restores the very same row, keeping its leg
  -- preferences and any expense that references it.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trip_id),
  unique (id, day_id),
  constraint itinerary_stops_day_same_trip
    foreign key (day_id, trip_id)
    references public.itinerary_days (id, trip_id)
    on delete cascade
);

create index itinerary_stops_day_idx on public.itinerary_stops (day_id, position)
  where deleted_at is null;

create trigger itinerary_stops_set_updated_at
  before update on public.itinerary_stops
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- itinerary_leg_preferences
-- ---------------------------------------------------------------------------
-- Keyed by the ordered pair of stops, never by position, so a preference can
-- only ever be reused for the very same journey. A pair that stops being
-- adjacent simply goes unused, and returns intact if the order is restored.

create table public.itinerary_leg_preferences (
  id uuid primary key default extensions.gen_random_uuid(),
  day_id uuid not null,
  trip_id uuid not null,
  origin_stop_id uuid not null,
  destination_stop_id uuid not null,
  transport_mode public.transport_mode not null,
  selected_route_reference text,
  manual_duration_minutes integer
    check (manual_duration_minutes is null or manual_duration_minutes between 0 and 1440),
  -- "แสดงบนแผนที่": map visibility only, never affects the plan or totals.
  visible_on_map boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itinerary_legs_distinct_stops check (origin_stop_id <> destination_stop_id),
  unique (day_id, origin_stop_id, destination_stop_id),
  constraint itinerary_legs_day_same_trip
    foreign key (day_id, trip_id)
    references public.itinerary_days (id, trip_id)
    on delete cascade,
  constraint itinerary_legs_origin_same_day
    foreign key (origin_stop_id, day_id)
    references public.itinerary_stops (id, day_id)
    on delete cascade,
  constraint itinerary_legs_destination_same_day
    foreign key (destination_stop_id, day_id)
    references public.itinerary_stops (id, day_id)
    on delete cascade
);

create index itinerary_legs_day_idx on public.itinerary_leg_preferences (day_id);

create trigger itinerary_legs_set_updated_at
  before update on public.itinerary_leg_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- itinerary_route_cache
-- ---------------------------------------------------------------------------
-- Only written when the configured provider's terms permit caching. Every row
-- records its provenance and an expiry so stale or no-longer-licensed data
-- cannot linger.

create table public.itinerary_route_cache (
  id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  provider text not null,
  transport_mode public.transport_mode not null,
  -- Rounded coordinates + departure bucket; see routeCacheKey() in the app.
  cache_key text not null,
  payload jsonb not null,
  attribution text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (trip_id, provider, transport_mode, cache_key)
);

create index itinerary_route_cache_expiry_idx on public.itinerary_route_cache (expires_at);

-- ---------------------------------------------------------------------------
-- optional itinerary reference on an expense
-- ---------------------------------------------------------------------------
-- ON DELETE SET NULL throughout: removing a stop or a leg must never touch the
-- recorded expense or its financial history.

alter table public.expenses
  add column itinerary_day_id uuid references public.itinerary_days (id) on delete set null,
  add column itinerary_origin_stop_id uuid references public.itinerary_stops (id) on delete set null,
  add column itinerary_destination_stop_id uuid references public.itinerary_stops (id) on delete set null;

create index expenses_itinerary_day_idx on public.expenses (itinerary_day_id)
  where itinerary_day_id is not null;

-- A reference may only ever point inside the same trip.
create or replace function public.guard_expense_itinerary_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip uuid;
begin
  -- A row that is not there yet (or is being cleared by the very cascade that
  -- fired this trigger) is not a cross-trip reference: only a row that exists
  -- and belongs to another trip is. The foreign keys already guarantee that a
  -- reference the application sets points at a live row.
  if new.itinerary_day_id is not null then
    select trip_id into v_trip from public.itinerary_days where id = new.itinerary_day_id;
    if v_trip is not null and v_trip <> new.trip_id then
      raise exception 'อ้างอิงแผนการเดินทางข้ามทริปไม่ได้' using errcode = '42501';
    end if;
  end if;

  if new.itinerary_origin_stop_id is not null then
    select trip_id into v_trip from public.itinerary_stops where id = new.itinerary_origin_stop_id;
    if v_trip is not null and v_trip <> new.trip_id then
      raise exception 'อ้างอิงแผนการเดินทางข้ามทริปไม่ได้' using errcode = '42501';
    end if;
  end if;

  if new.itinerary_destination_stop_id is not null then
    select trip_id into v_trip from public.itinerary_stops where id = new.itinerary_destination_stop_id;
    if v_trip is not null and v_trip <> new.trip_id then
      raise exception 'อ้างอิงแผนการเดินทางข้ามทริปไม่ได้' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger expenses_guard_itinerary_reference
  before insert or update on public.expenses
  for each row execute function public.guard_expense_itinerary_reference();
