-- TripMate :: an invalid invite link is an answer, not an exception
--
-- join_trip_by_token() raised P0002 for a token that no longer resolves. Three
-- things follow from raising on an expected outcome:
--
--   1. The PostgREST transaction is aborted, so the pooled connection is left
--      in "idle in transaction (aborted)" until the pooler resets it.
--   2. pg_stat_statements does not record a statement that raises. Only the
--      pre-request set_config() of that request is counted. A client calling
--      this function in a loop therefore shows up as tens of millions of
--      set_config calls and a single-digit call count for the function itself
--      — which is exactly how a retry loop stayed invisible here for weeks.
--   3. The client cannot tell "the link is dead" from "the database is down",
--      so a retry looks reasonable when it is guaranteed to fail.
--
-- Returning null says the same thing, costs a rollback nothing, and is counted.
-- Not being signed in still raises: PostgREST never reaches this without a JWT,
-- so that really is exceptional.

create or replace function public.join_trip_by_token(
  p_token text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
  v_member_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;

  select id into v_trip_id
  from public.trips
  where invite_token = p_token and deleted_at is null;

  -- No such live invitation. The caller renders this as a dead link.
  if v_trip_id is null then
    return null;
  end if;

  -- Already an active member: joining again is a no-op.
  select id into v_member_id
  from public.trip_members
  where trip_id = v_trip_id and user_id = v_uid and removed_at is null;

  if v_member_id is not null then
    return v_trip_id;
  end if;

  -- Previously removed: reactivate the same row so expenses stay attached.
  select id into v_member_id
  from public.trip_members
  where trip_id = v_trip_id and user_id = v_uid
  order by joined_at desc
  limit 1;

  if v_member_id is not null then
    update public.trip_members
    set removed_at = null, joined_at = now()
    where id = v_member_id;
    return v_trip_id;
  end if;

  select coalesce(
    nullif(btrim(p_display_name), ''),
    nullif(btrim(p.display_name), ''),
    'สมาชิกใหม่'
  )
  into v_name
  from public.profiles p
  where p.id = v_uid;

  v_name := coalesce(v_name, nullif(btrim(p_display_name), ''), 'สมาชิกใหม่');

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip_id, v_uid, v_name, 'member');

  return v_trip_id;
end;
$$;
