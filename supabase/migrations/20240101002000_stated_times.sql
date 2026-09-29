-- TripMate :: a place can simply be told what time it is
--
-- The plan used to be one chain: the day's start, plus each visit, plus each
-- journey, worked forwards. Leave out how long you stay somewhere, or how long
-- a journey takes, and every time after it became unknowable — which is honest,
-- but it meant one blank field turned the rest of the day into a column of
-- "ยังไม่ได้ระบุ…" and there was nothing to do about it but fill in the thing
-- it was waiting for.
--
-- A place can now carry its own arrival and departure. A time written down is
-- taken as fact and owes nothing to what comes before it, so a day can be
-- filled in from the middle, or from the end, or not at all. What can still be
-- worked out still is; what cannot is simply blank.
--
-- not_before_local_time was the old constraint — "get there no earlier than
-- this" — and its values are what people meant by the arrival time, so they
-- move across. The column stays for one release rather than being dropped
-- under a deployment that is still reading it.

alter table public.itinerary_stops
  add column if not exists arrival_local_time time,
  add column if not exists departure_local_time time;

update public.itinerary_stops
set arrival_local_time = not_before_local_time
where not_before_local_time is not null
  and arrival_local_time is null;

comment on column public.itinerary_stops.not_before_local_time is
  'Superseded by arrival_local_time in 20240101002000. Kept for one release.';

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- the two functions that write a stop
-- ---------------------------------------------------------------------------

create or replace function public.save_itinerary_stop(
  p_trip_id uuid,
  p_stop_id uuid,
  p_name text,
  p_notes text,
  p_visit_duration_minutes integer,
  p_arrival_local_time time,
  p_departure_local_time time,
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
      arrival_local_time = p_arrival_local_time,
      departure_local_time = p_departure_local_time,
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
  p_arrival_local_time time default null,
  p_departure_local_time time default null,
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
     latitude, longitude, visit_duration_minutes, arrival_local_time,
     departure_local_time, created_by)
  values
    (p_id, p_day_id, p_trip_id, v_position, p_place_provider, p_place_id, p_name,
     p_address, p_latitude, p_longitude, p_visit_duration_minutes,
     p_arrival_local_time, p_departure_local_time, auth.uid())
  on conflict (id) do nothing;

  return v_version;
end;
$$;

-- The old shapes, which took not_before_local_time, are gone: leaving them
-- callable would mean two ways to write a stop, one of which writes the wrong
-- column.
drop function if exists public.save_itinerary_stop(uuid, uuid, text, text, integer, time, boolean, uuid, public.transport_mode, integer, text, integer);
drop function if exists public.add_itinerary_stop(uuid, uuid, uuid, text, text, numeric, numeric, text, text, integer, time, integer);

revoke all on function public.save_itinerary_stop(uuid, uuid, text, text, integer, time, time, boolean, uuid, public.transport_mode, integer, text, integer) from public, anon;
revoke all on function public.add_itinerary_stop(uuid, uuid, uuid, text, text, numeric, numeric, text, text, integer, time, time, integer) from public, anon;
grant execute on function public.save_itinerary_stop(uuid, uuid, text, text, integer, time, time, boolean, uuid, public.transport_mode, integer, text, integer) to authenticated;
grant execute on function public.add_itinerary_stop(uuid, uuid, uuid, text, text, numeric, numeric, text, text, integer, time, time, integer) to authenticated;

notify pgrst, 'reload schema';
