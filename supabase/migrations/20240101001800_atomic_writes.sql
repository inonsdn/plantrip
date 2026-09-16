-- TripMate :: one statement per action, and a schema that matches the code
--
-- Two problems, both found by scanning every write in the codebase at once
-- rather than one failure at a time.
--
-- 1. Five actions performed two or three writes in a row with nothing holding
--    them together. Each one is a separate PostgREST request, so a failure
--    halfway leaves the first write applied and reports a failure: the day's
--    version bumped for an edit that did not happen, the place saved but not
--    the journey out of it, money recorded as transferred but never confirmed.
--    Every one of them is a single function below.
--
-- 2. Anything added to a table after it was created can be missing from a
--    database that was set up before that migration, and the code has no way to
--    tell — a read with select('*') happily returns a row without the column,
--    while a write of it fails with PGRST204. That is exactly how "บันทึกการ
--    เดินทางไม่สำเร็จ" happened. Every such change is re-applied idempotently
--    here, so a database that is behind catches up and one that is not is
--    untouched.

-- ---------------------------------------------------------------------------
-- 1. schema reconciliation — every post-creation change, made idempotent
-- ---------------------------------------------------------------------------

alter table public.settlements
  add column if not exists expense_id uuid;

alter table public.expenses
  add column if not exists itinerary_day_id uuid references public.itinerary_days (id) on delete set null,
  add column if not exists itinerary_origin_stop_id uuid references public.itinerary_stops (id) on delete set null,
  add column if not exists itinerary_destination_stop_id uuid references public.itinerary_stops (id) on delete set null;

alter type public.transport_mode add value if not exists 'flight';
alter type public.transport_mode add value if not exists 'train';
alter type public.transport_mode add value if not exists 'ferry';
alter type public.transport_mode add value if not exists 'taxi';

alter table public.itinerary_stops alter column latitude drop not null;
alter table public.itinerary_stops alter column longitude drop not null;
alter table public.itinerary_stops alter column visit_duration_minutes drop not null;

-- The one that broke saving a place with an onward journey.
alter table public.itinerary_leg_preferences
  add column if not exists notes text;

do $$
begin
  alter table public.itinerary_leg_preferences
    add constraint itinerary_legs_notes_length
    check (notes is null or char_length(notes) <= 1000);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. itinerary: one function per action
-- ---------------------------------------------------------------------------

/**
 * A place and the journey out of it, saved together.
 *
 * Was: bump_itinerary_day(), then update the stop, then upsert the leg — three
 * requests. The version bumped even when the leg failed, so the client's idea
 * of the version was left wrong by a failure it was told nothing about.
 */
create or replace function public.save_itinerary_stop(
  p_trip_id uuid,
  p_stop_id uuid,
  p_name text,
  p_notes text,
  p_visit_duration_minutes integer,
  p_not_before_local_time time,
  p_enabled boolean,
  p_leg_destination_stop_id uuid default null,
  p_leg_transport_mode public.transport_mode default null,
  p_leg_manual_duration_minutes integer default null,
  p_leg_notes text default null,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_day_id uuid;
  v_version integer;
begin
  if p_leg_destination_stop_id is not null and p_leg_destination_stop_id = p_stop_id then
    raise exception 'ต้นทางและปลายทางต้องเป็นคนละจุด' using errcode = '42501';
  end if;

  select day_id into v_day_id
  from public.itinerary_stops
  where id = p_stop_id and trip_id = p_trip_id;

  if v_day_id is null then
    raise exception 'ไม่พบสถานที่นี้' using errcode = 'P0002';
  end if;

  v_version := public.bump_itinerary_day(v_day_id, p_expected_version);

  update public.itinerary_stops
  set name = p_name,
      notes = p_notes,
      visit_duration_minutes = p_visit_duration_minutes,
      not_before_local_time = p_not_before_local_time,
      enabled = p_enabled
  where id = p_stop_id and trip_id = p_trip_id;

  if p_leg_destination_stop_id is not null then
    insert into public.itinerary_leg_preferences
      (day_id, trip_id, origin_stop_id, destination_stop_id,
       transport_mode, manual_duration_minutes, notes)
    values
      (v_day_id, p_trip_id, p_stop_id, p_leg_destination_stop_id,
       p_leg_transport_mode, p_leg_manual_duration_minutes, p_leg_notes)
    on conflict (day_id, origin_stop_id, destination_stop_id) do update
      set transport_mode = excluded.transport_mode,
          manual_duration_minutes = excluded.manual_duration_minutes,
          notes = excluded.notes;
  end if;

  return v_version;
end;
$$;

/** Adds a place at the end of a day. The id is the caller's, so a replay collides. */
create or replace function public.add_itinerary_stop(
  p_trip_id uuid,
  p_day_id uuid,
  p_id uuid,
  p_name text,
  p_address text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_place_provider text default 'manual',
  p_place_id text default null,
  p_visit_duration_minutes integer default null,
  p_not_before_local_time time default null,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_position integer;
begin
  if not exists (
    select 1 from public.itinerary_days where id = p_day_id and trip_id = p_trip_id
  ) then
    raise exception 'ไม่พบวันนี้ในแผนการเดินทาง' using errcode = 'P0002';
  end if;

  -- Already added, by an earlier attempt of this same change: nothing to do,
  -- and nothing to bump. Answering with the current version lets a client that
  -- is replaying stop replaying.
  if exists (select 1 from public.itinerary_stops where id = p_id) then
    select version into v_version from public.itinerary_days where id = p_day_id;
    return v_version;
  end if;

  v_version := public.bump_itinerary_day(p_day_id, p_expected_version);

  select coalesce(max(position) + 1, 0) into v_position
  from public.itinerary_stops
  where day_id = p_day_id and deleted_at is null;

  insert into public.itinerary_stops
    (id, day_id, trip_id, position, place_provider, place_id, name, address,
     latitude, longitude, visit_duration_minutes, not_before_local_time, created_by)
  values
    (p_id, p_day_id, p_trip_id, v_position, p_place_provider, p_place_id, p_name,
     p_address, p_latitude, p_longitude, p_visit_duration_minutes,
     p_not_before_local_time, auth.uid())
  on conflict (id) do nothing;

  return v_version;
end;
$$;

/** Day settings. Was a bump and an update; a failed update left the bump behind. */
create or replace function public.update_itinerary_day(
  p_trip_id uuid,
  p_day_id uuid,
  p_start_local_time time,
  p_time_zone text,
  p_default_transport_mode public.transport_mode,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_version integer;
begin
  if not exists (
    select 1 from public.itinerary_days where id = p_day_id and trip_id = p_trip_id
  ) then
    raise exception 'ไม่พบวันนี้ในแผนการเดินทาง' using errcode = 'P0002';
  end if;

  v_version := public.bump_itinerary_day(p_day_id, p_expected_version);

  update public.itinerary_days
  set start_local_time = p_start_local_time,
      time_zone = p_time_zone,
      default_transport_mode = p_default_transport_mode
  where id = p_day_id and trip_id = p_trip_id;

  return v_version;
end;
$$;

revoke all on function public.save_itinerary_stop(uuid, uuid, text, text, integer, time, boolean, uuid, public.transport_mode, integer, text, integer) from public, anon;
revoke all on function public.add_itinerary_stop(uuid, uuid, uuid, text, text, numeric, numeric, text, text, integer, time, integer) from public, anon;
revoke all on function public.update_itinerary_day(uuid, uuid, time, text, public.transport_mode, integer) from public, anon;
grant execute on function public.save_itinerary_stop(uuid, uuid, text, text, integer, time, boolean, uuid, public.transport_mode, integer, text, integer) to authenticated;
grant execute on function public.add_itinerary_stop(uuid, uuid, uuid, text, text, numeric, numeric, text, text, integer, time, integer) to authenticated;
grant execute on function public.update_itinerary_day(uuid, uuid, time, text, public.transport_mode, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. settlements: record and confirm in one go
-- ---------------------------------------------------------------------------

/**
 * "โอนครบแล้ว": writes the transfers that are missing and confirms the claims
 * this person is the receiver of.
 *
 * Was two requests. A failure between them left money recorded as transferred
 * with the confirmations never applied, and reported the whole thing as failed
 * — so the next attempt saw the rows it had just written as already existing
 * and refused with "มีบางรายการถูกบันทึกไปแล้ว".
 *
 * The rows are computed by the caller, which is where the split arithmetic
 * lives; this function's job is only that all of it lands or none of it does.
 */
create or replace function public.settle_all_expenses(
  p_trip_id uuid,
  p_new jsonb,
  p_confirm uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_written integer := 0;
  v_confirmed integer := 0;
begin
  if jsonb_array_length(coalesce(p_new, '[]'::jsonb)) > 0 then
    with inserted as (
      insert into public.settlements
        (trip_id, expense_id, from_member_id, to_member_id, amount_base,
         status, paid_at, note, created_by)
      select
        p_trip_id,
        (row ->> 'expense_id')::uuid,
        (row ->> 'from_member_id')::uuid,
        (row ->> 'to_member_id')::uuid,
        (row ->> 'amount_base')::numeric,
        (row ->> 'status')::public.settlement_status,
        case when row ->> 'status' = 'paid' then v_now else null end,
        row ->> 'note',
        auth.uid()
      from jsonb_array_elements(p_new) as row
      returning 1
    )
    select count(*) into v_written from inserted;
  end if;

  if coalesce(array_length(p_confirm, 1), 0) > 0 then
    with confirmed as (
      update public.settlements
      set status = 'paid', paid_at = v_now
      where trip_id = p_trip_id and id = any(p_confirm)
      returning 1
    )
    select count(*) into v_confirmed from confirmed;
  end if;

  return v_written + v_confirmed;
end;
$$;

revoke all on function public.settle_all_expenses(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.settle_all_expenses(uuid, jsonb, uuid[]) to authenticated;
