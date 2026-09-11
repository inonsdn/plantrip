-- TripMate :: privileged operations
--
-- These are the only ways a row lands in public.trip_members. Each one checks
-- auth.uid() itself because SECURITY DEFINER bypasses row level security.

-- ---------------------------------------------------------------------------
-- create_trip
-- ---------------------------------------------------------------------------

create or replace function public.create_trip(
  p_name text,
  p_destination text default '',
  p_start_date date default null,
  p_end_date date default null,
  p_base_currency text default 'THB',
  p_owner_display_name text default null,
  p_secondary_currency text default null,
  p_secondary_rate numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
  v_base text := upper(btrim(coalesce(p_base_currency, 'THB')));
  v_secondary text := nullif(upper(btrim(coalesce(p_secondary_currency, ''))), '');
  v_name text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;

  select coalesce(
    nullif(btrim(p_owner_display_name), ''),
    nullif(btrim(p.display_name), ''),
    'ฉัน'
  )
  into v_name
  from public.profiles p
  where p.id = v_uid;

  v_name := coalesce(v_name, nullif(btrim(p_owner_display_name), ''), 'ฉัน');

  insert into public.trips (owner_id, name, destination, start_date, end_date, base_currency)
  values (v_uid, btrim(p_name), btrim(coalesce(p_destination, '')), p_start_date, p_end_date, v_base)
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip_id, v_uid, v_name, 'owner');

  insert into public.trip_currencies (trip_id, currency_code, default_exchange_rate)
  values (v_trip_id, v_base, 1);

  if v_secondary is not null and v_secondary <> v_base then
    insert into public.trip_currencies (trip_id, currency_code, default_exchange_rate)
    values (v_trip_id, v_secondary, coalesce(nullif(p_secondary_rate, 0), 1));
  end if;

  return v_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- invitation flow
-- ---------------------------------------------------------------------------

-- Minimal, non-sensitive preview so a signed-in visitor can see what they are
-- about to join. Never returns the member list or any e-mail address.
create or replace function public.trip_preview_by_token(p_token text)
returns table (
  trip_id uuid,
  name text,
  destination text,
  start_date date,
  end_date date,
  base_currency text,
  member_count integer,
  owner_display_name text,
  already_member boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name,
    t.destination,
    t.start_date,
    t.end_date,
    t.base_currency,
    (select count(*)::int from public.trip_members m
      where m.trip_id = t.id and m.removed_at is null),
    (select m.display_name from public.trip_members m
      where m.trip_id = t.id and m.role = 'owner' and m.removed_at is null
      order by m.joined_at limit 1),
    exists (
      select 1 from public.trip_members m
      where m.trip_id = t.id and m.user_id = auth.uid() and m.removed_at is null
    )
  from public.trips t
  where t.invite_token = p_token
    and t.deleted_at is null
    and auth.uid() is not null;
$$;

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

  if v_trip_id is null then
    raise exception 'ลิงก์เชิญไม่ถูกต้องหรือถูกยกเลิกแล้ว' using errcode = 'P0002';
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

create or replace function public.regenerate_invite_token(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'เฉพาะเจ้าของทริปเท่านั้นที่สร้างลิงก์ใหม่ได้' using errcode = '42501';
  end if;

  update public.trips
  set invite_token = public.generate_invite_token(),
      invite_token_created_at = now()
  where id = p_trip_id
  returning invite_token into v_token;

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- membership management
-- ---------------------------------------------------------------------------

create or replace function public.remove_trip_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.trip_members;
begin
  select * into v_member from public.trip_members where id = p_member_id;

  if v_member.id is null then
    raise exception 'ไม่พบสมาชิกคนนี้' using errcode = 'P0002';
  end if;

  if not public.is_trip_owner(v_member.trip_id) then
    raise exception 'เฉพาะเจ้าของทริปเท่านั้นที่ลบสมาชิกได้' using errcode = '42501';
  end if;

  if v_member.role = 'owner' then
    raise exception 'ไม่สามารถลบเจ้าของทริปออกได้' using errcode = '42501';
  end if;

  -- Soft-remove only: expenses and settlements keep referencing this row.
  update public.trip_members
  set removed_at = now()
  where id = p_member_id and removed_at is null;
end;
$$;

create or replace function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;

  if public.is_trip_owner(p_trip_id) then
    raise exception 'เจ้าของทริปออกจากทริปไม่ได้ กรุณาลบทริปแทน' using errcode = '42501';
  end if;

  update public.trip_members
  set removed_at = now()
  where trip_id = p_trip_id and user_id = v_uid and removed_at is null;
end;
$$;

create or replace function public.delete_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'เฉพาะเจ้าของทริปเท่านั้นที่ลบทริปได้' using errcode = '42501';
  end if;

  -- Soft delete keeps the financial history recoverable.
  update public.trips set deleted_at = now() where id = p_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

revoke all on function public.create_trip(text, text, date, date, text, text, text, numeric) from public, anon;
revoke all on function public.trip_preview_by_token(text) from public, anon;
revoke all on function public.join_trip_by_token(text, text) from public, anon;
revoke all on function public.regenerate_invite_token(uuid) from public, anon;
revoke all on function public.remove_trip_member(uuid) from public, anon;
revoke all on function public.leave_trip(uuid) from public, anon;
revoke all on function public.delete_trip(uuid) from public, anon;
revoke all on function public.generate_invite_token() from public, anon, authenticated;

grant execute on function public.create_trip(text, text, date, date, text, text, text, numeric) to authenticated;
grant execute on function public.trip_preview_by_token(text) to authenticated;
grant execute on function public.join_trip_by_token(text, text) to authenticated;
grant execute on function public.regenerate_invite_token(uuid) to authenticated;
grant execute on function public.remove_trip_member(uuid) to authenticated;
grant execute on function public.leave_trip(uuid) to authenticated;
grant execute on function public.delete_trip(uuid) to authenticated;
