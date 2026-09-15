-- TripMate :: stop writing rows nothing asked us to write

-- ---------------------------------------------------------------------------
-- auth.users trigger
-- ---------------------------------------------------------------------------
-- The trigger was `after insert or update`. GoTrue writes auth.users on sign
-- in, on token refresh and on any metadata change, and every one of those
-- writes ran an INSERT ... ON CONFLICT DO UPDATE against public.profiles. The
-- ON CONFLICT branch always produces a new row version even when no column
-- changes, which then fires profiles_set_updated_at, writes WAL and leaves a
-- dead tuple for autovacuum — for a row that was already correct.
--
-- Creating the profile is the only part that has to happen here. Keeping the
-- name and avatar fresh already happens explicitly in /auth/callback, which
-- runs once per sign-in rather than once per token refresh.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- reorder_itinerary_stops
-- ---------------------------------------------------------------------------
-- The old body shifted every stop's position by +100000 and then rewrote them,
-- so a drag of an N-stop day wrote 2N row versions. The shift existed to dodge
-- a unique-collision mid-update, but itinerary_stops_day_idx is not a unique
-- index: (day_id, position) has never been constrained. One pass is enough,
-- and it only touches the rows whose position actually changes.

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

  update public.itinerary_stops st
  set position = ordered.index - 1
  from (
    select id, row_number() over () as index from unnest(p_stop_ids) as t(id)
  ) as ordered
  where st.id = ordered.id
    and st.day_id = p_day_id
    -- Rows already in the right place need no new version.
    and st.position is distinct from ordered.index - 1;

  return v_version;
end;
$$;
