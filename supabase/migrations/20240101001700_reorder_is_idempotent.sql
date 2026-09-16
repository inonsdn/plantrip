-- TripMate :: asking for the order it is already in is a no-op, not a conflict
--
-- From the Postgres log, one PostgREST connection (pid 46488, open since
-- 18:29:57 UTC) reached session_line_num 21,232,540 by 03:31:59 UTC the next
-- morning: 653 raised exceptions per second, for nine hours, with nobody using
-- the app. Every one of them:
--
--   PL/pgSQL function bump_itinerary_day(uuid,integer) line 12 at RAISE
--   PL/pgSQL function reorder_itinerary_stops(uuid,uuid[],integer) line 6
--
-- The old body called bump_itinerary_day() first, so a client resending an
-- order that had *already been applied* was refused on its stale version
-- before anything looked at whether there was work to do. The refusal is what
-- made the client ask again, which is what made it a loop — and each turn of
-- it consumed a transaction id, wrote a WAL record's worth of abort, and
-- shipped an ERROR line to the log pipeline.
--
-- Reordering to the order you are already in is not a conflict with anyone.
-- It is nothing at all, and the honest answer is the current version. A
-- retrying client gets a success, stops retrying, and the loop ends itself.
--
-- The version check still guards every reorder that genuinely changes
-- something, which is the case it was written for.

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
  v_current uuid[];
begin
  -- Read before write. Nothing here takes a lock or an exception path.
  select array_agg(id order by position)
  into v_current
  from public.itinerary_stops
  where day_id = p_day_id and deleted_at is null;

  select version into v_version from public.itinerary_days where id = p_day_id;
  if v_version is null then
    raise exception 'ไม่พบวันนี้ในแผนการเดินทาง' using errcode = 'P0002';
  end if;

  -- Already in this order: write nothing, bump nothing, refuse nothing.
  if coalesce(v_current, array[]::uuid[]) = coalesce(p_stop_ids, array[]::uuid[]) then
    return v_version;
  end if;

  if coalesce(array_length(v_current, 1), 0) <> coalesce(array_length(p_stop_ids, 1), 0) then
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

  -- Only now, with a real change to make, is the version checked and taken.
  v_version := public.bump_itinerary_day(p_day_id, p_expected_version);

  update public.itinerary_stops st
  set position = ordered.index - 1
  from (
    select id, row_number() over () as index from unnest(p_stop_ids) as t(id)
  ) as ordered
  where st.id = ordered.id
    and st.day_id = p_day_id
    and st.position is distinct from ordered.index - 1;

  return v_version;
end;
$$;
