-- TripMate :: members who do not have an account yet
--
-- Two operations, both SECURITY DEFINER because public.trip_members has no
-- INSERT policy and no client may write to it directly.

-- ---------------------------------------------------------------------------
-- add_trip_member: a seat for someone who has not been invited
-- ---------------------------------------------------------------------------
-- Any *active* member may add one. Adding a placeholder is low risk and often
-- needed mid-trip while entering an expense; removing a member stays
-- owner-only (public.remove_trip_member).

create or replace function public.add_trip_member(
  p_trip_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;

  if not public.is_active_trip_member(p_trip_id) then
    raise exception 'คุณไม่ได้เป็นสมาชิกของทริปนี้' using errcode = '42501';
  end if;

  if v_name = '' or char_length(v_name) > 60 then
    raise exception 'กรุณากรอกชื่อความยาว 1-60 ตัวอักษร' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id
      and removed_at is null
      and lower(display_name) = lower(v_name)
  ) then
    raise exception 'มีสมาชิกชื่อ "%" ในทริปนี้อยู่แล้ว', v_name using errcode = '22023';
  end if;

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (p_trip_id, null, v_name, 'member')
  returning id into v_member_id;

  return v_member_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_trip_member: link a placeholder seat to someone who has now joined
-- ---------------------------------------------------------------------------
-- The placeholder keeps its id, so every expense already recorded against it
-- stays attached. The membership row created when the person joined through the
-- invitation link is retired.
--
-- Refused when that joined row is already referenced by an expense, split or
-- settlement: merging then would split one person's history across two member
-- rows, which is worse than leaving both seats in place.

create or replace function public.claim_trip_member(
  p_placeholder_id uuid,
  p_joined_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_placeholder public.trip_members;
  v_joined public.trip_members;
  v_refs integer;
begin
  select * into v_placeholder from public.trip_members where id = p_placeholder_id;
  select * into v_joined from public.trip_members where id = p_joined_member_id;

  if v_placeholder.id is null or v_joined.id is null then
    raise exception 'ไม่พบสมาชิกที่ระบุ' using errcode = 'P0002';
  end if;

  if v_placeholder.trip_id <> v_joined.trip_id then
    raise exception 'สมาชิกทั้งสองต้องอยู่ในทริปเดียวกัน' using errcode = '42501';
  end if;

  if not public.is_trip_owner(v_placeholder.trip_id) then
    raise exception 'เฉพาะเจ้าของทริปเท่านั้นที่จับคู่สมาชิกได้' using errcode = '42501';
  end if;

  if v_placeholder.user_id is not null then
    raise exception 'ชื่อ "%" ถูกจับคู่กับบัญชีอื่นไปแล้ว', v_placeholder.display_name
      using errcode = '22023';
  end if;

  if v_joined.user_id is null then
    raise exception 'สมาชิกปลายทางยังไม่ได้เชื่อมกับบัญชีผู้ใช้' using errcode = '22023';
  end if;

  if v_joined.role = 'owner' then
    raise exception 'ไม่สามารถจับคู่บัญชีของเจ้าของทริปได้' using errcode = '42501';
  end if;

  if v_placeholder.removed_at is not null or v_joined.removed_at is not null then
    raise exception 'จับคู่ได้เฉพาะสมาชิกที่ยังอยู่ในทริป' using errcode = '22023';
  end if;

  select
    (select count(*) from public.expenses
      where payer_member_id = v_joined.id and deleted_at is null)
    + (select count(*) from public.expense_splits where member_id = v_joined.id)
    + (select count(*) from public.settlements
        where from_member_id = v_joined.id or to_member_id = v_joined.id)
  into v_refs;

  if v_refs > 0 then
    raise exception
      'บัญชีนี้มีรายการในทริปแล้ว (% รายการ) จึงรวมกับ "%" ไม่ได้',
      v_refs, v_placeholder.display_name
      using errcode = '22023';
  end if;

  -- Retire the joined seat first: the active-membership unique index only
  -- covers rows where removed_at is null, so this frees the (trip, user) slot.
  update public.trip_members
  set removed_at = now()
  where id = v_joined.id;

  update public.trip_members
  set user_id = v_joined.user_id
  where id = v_placeholder.id;
end;
$$;

revoke all on function public.add_trip_member(uuid, text) from public, anon;
revoke all on function public.claim_trip_member(uuid, uuid) from public, anon;
grant execute on function public.add_trip_member(uuid, text) to authenticated;
grant execute on function public.claim_trip_member(uuid, uuid) to authenticated;
