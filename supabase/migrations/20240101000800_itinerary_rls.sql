-- TripMate :: itinerary authorization and transactional operations

alter table public.itinerary_days enable row level security;
alter table public.itinerary_stops enable row level security;
alter table public.itinerary_leg_preferences enable row level security;
alter table public.itinerary_route_cache enable row level security;

-- Active members read and edit; everyone else sees nothing. The composite keys
-- in the previous migration already make a cross-trip row impossible, so these
-- policies only have to check membership of the row's own trip.

create policy itinerary_days_select on public.itinerary_days
  for select to authenticated using (public.is_active_trip_member(trip_id));
create policy itinerary_days_insert on public.itinerary_days
  for insert to authenticated with check (public.is_active_trip_member(trip_id));
create policy itinerary_days_update on public.itinerary_days
  for update to authenticated
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));
create policy itinerary_days_delete on public.itinerary_days
  for delete to authenticated using (public.is_active_trip_member(trip_id));

create policy itinerary_stops_select on public.itinerary_stops
  for select to authenticated using (public.is_active_trip_member(trip_id));
create policy itinerary_stops_insert on public.itinerary_stops
  for insert to authenticated with check (public.is_active_trip_member(trip_id));
create policy itinerary_stops_update on public.itinerary_stops
  for update to authenticated
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));
create policy itinerary_stops_delete on public.itinerary_stops
  for delete to authenticated using (public.is_active_trip_member(trip_id));

create policy itinerary_legs_select on public.itinerary_leg_preferences
  for select to authenticated using (public.is_active_trip_member(trip_id));
create policy itinerary_legs_insert on public.itinerary_leg_preferences
  for insert to authenticated with check (public.is_active_trip_member(trip_id));
create policy itinerary_legs_update on public.itinerary_leg_preferences
  for update to authenticated
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));
create policy itinerary_legs_delete on public.itinerary_leg_preferences
  for delete to authenticated using (public.is_active_trip_member(trip_id));

-- The cache is written only by the server route handler, never by a client.
create policy itinerary_route_cache_select on public.itinerary_route_cache
  for select to authenticated using (public.is_active_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- version guard
-- ---------------------------------------------------------------------------

/** Bumps the day version and fails when another edit landed first. */
create or replace function public.bump_itinerary_day(
  p_day_id uuid,
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
  select version into v_version from public.itinerary_days where id = p_day_id for update;

  if v_version is null then
    raise exception 'ไม่พบวันนี้ในแผนการเดินทาง' using errcode = 'P0002';
  end if;

  if p_expected_version is not null and p_expected_version <> v_version then
    raise exception 'มีคนแก้ไขแผนวันนี้ไปแล้ว กรุณาโหลดใหม่แล้วลองอีกครั้ง'
      using errcode = '40001';
  end if;

  update public.itinerary_days
  set version = version + 1
  where id = p_day_id
  returning version into v_version;

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- reorder / move, in one transaction
-- ---------------------------------------------------------------------------

/**
 * Rewrites the order of one day's stops.
 *
 * Positions are shifted out of range first so the unique ordering never
 * collides mid-update, and the whole thing is one statement batch inside the
 * function's transaction.
 */
create or replace function public.reorder_itinerary_stops(
  p_day_id uuid,
  p_stop_ids uuid[],
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_count integer;
begin
  v_version := public.bump_itinerary_day(p_day_id, p_expected_version);

  select count(*) into v_count from public.itinerary_stops
  where day_id = p_day_id and deleted_at is null;
  if v_count <> coalesce(array_length(p_stop_ids, 1), 0) then
    raise exception 'รายการสถานที่ไม่ตรงกับข้อมูลล่าสุด กรุณาโหลดใหม่' using errcode = '40001';
  end if;

  if exists (
    select 1 from unnest(p_stop_ids) as s(id)
    where not exists (
      select 1 from public.itinerary_stops st where st.id = s.id and st.day_id = p_day_id
    )
  ) then
    raise exception 'มีสถานที่ที่ไม่ได้อยู่ในวันนี้' using errcode = '42501';
  end if;

  update public.itinerary_stops
  set position = position + 100000
  where day_id = p_day_id and deleted_at is null;

  update public.itinerary_stops st
  set position = ordered.index - 1
  from (select id, row_number() over () as index from unnest(p_stop_ids) as t(id)) as ordered
  where st.id = ordered.id and st.day_id = p_day_id;

  return v_version;
end;
$$;

/** Moves one stop to another day of the same trip, appending it at the end. */
create or replace function public.move_itinerary_stop(
  p_stop_id uuid,
  p_target_day_id uuid,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stop public.itinerary_stops;
  v_target public.itinerary_days;
  v_next_position integer;
begin
  select * into v_stop from public.itinerary_stops where id = p_stop_id;
  select * into v_target from public.itinerary_days where id = p_target_day_id;

  if v_stop.id is null or v_target.id is null then
    raise exception 'ไม่พบสถานที่หรือวันปลายทาง' using errcode = 'P0002';
  end if;
  if v_stop.trip_id <> v_target.trip_id then
    raise exception 'ย้ายสถานที่ข้ามทริปไม่ได้' using errcode = '42501';
  end if;
  if v_stop.day_id = p_target_day_id then
    return v_target.version;
  end if;

  perform public.bump_itinerary_day(v_stop.day_id, p_expected_version);

  select coalesce(max(position) + 1, 0) into v_next_position
  from public.itinerary_stops where day_id = p_target_day_id and deleted_at is null;

  -- Leg preferences on either side referenced this stop by id; the composite
  -- foreign keys drop exactly those and leave every other pair intact.
  delete from public.itinerary_leg_preferences
  where origin_stop_id = p_stop_id or destination_stop_id = p_stop_id;

  update public.itinerary_stops
  set day_id = p_target_day_id, position = v_next_position
  where id = p_stop_id;

  -- Close the gap left behind.
  update public.itinerary_stops st
  set position = ordered.index - 1
  from (
    select id, row_number() over (order by position) as index
    from public.itinerary_stops where day_id = v_stop.day_id and deleted_at is null
  ) as ordered
  where st.id = ordered.id;

  return public.bump_itinerary_day(p_target_day_id, null);
end;
$$;

revoke all on function public.bump_itinerary_day(uuid, integer) from public, anon;
revoke all on function public.reorder_itinerary_stops(uuid, uuid[], integer) from public, anon;
revoke all on function public.move_itinerary_stop(uuid, uuid, integer) from public, anon;
grant execute on function public.bump_itinerary_day(uuid, integer) to authenticated;
grant execute on function public.reorder_itinerary_stops(uuid, uuid[], integer) to authenticated;
grant execute on function public.move_itinerary_stop(uuid, uuid, integer) to authenticated;
