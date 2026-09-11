-- TripMate :: authorization helpers + row level security
--
-- Every helper below is SECURITY DEFINER so that policies on trip_members can
-- consult trip_members without recursing through its own RLS policies.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_active_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.trip_members m
    join public.trips t on t.id = m.trip_id
    where m.trip_id = p_trip_id
      and m.user_id = auth.uid()
      and m.removed_at is null
      and t.deleted_at is null
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
      and t.deleted_at is null
  );
$$;

-- Is the given user visible to me because we share at least one active trip?
create or replace function public.shares_active_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = auth.uid()
      and mine.removed_at is null
      and theirs.user_id = p_user_id
      and theirs.removed_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select_self_or_co_traveller on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_active_trip_with(id));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------

alter table public.trips enable row level security;

create policy trips_select_members on public.trips
  for select to authenticated
  using (deleted_at is null and public.is_active_trip_member(id));

-- Trips are normally created through public.create_trip(); this policy keeps a
-- direct insert honest if it ever happens.
create policy trips_insert_owner on public.trips
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy trips_update_owner on public.trips
  for update to authenticated
  using (deleted_at is null and owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Deliberately no DELETE policy on trips: public.delete_trip() soft-deletes so
-- that expenses, splits and settlements survive.

-- ---------------------------------------------------------------------------
-- trip_currencies
-- ---------------------------------------------------------------------------

alter table public.trip_currencies enable row level security;

create policy trip_currencies_select_members on public.trip_currencies
  for select to authenticated
  using (public.is_active_trip_member(trip_id));

create policy trip_currencies_insert_members on public.trip_currencies
  for insert to authenticated
  with check (public.is_active_trip_member(trip_id));

create policy trip_currencies_update_members on public.trip_currencies
  for update to authenticated
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

create policy trip_currencies_delete_owner on public.trip_currencies
  for delete to authenticated
  using (public.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------------

alter table public.trip_members enable row level security;

create policy trip_members_select_members on public.trip_members
  for select to authenticated
  using (public.is_active_trip_member(trip_id));

-- Deliberately no INSERT policy: joining happens only through
-- public.join_trip_by_token() / public.create_trip(), which validate the
-- invitation token server side. A client cannot add itself to a trip.

create policy trip_members_update_self_or_owner on public.trip_members
  for update to authenticated
  using (
    public.is_trip_owner(trip_id)
    or (user_id = auth.uid() and removed_at is null)
  )
  with check (
    public.is_trip_owner(trip_id)
    or (user_id = auth.uid() and removed_at is null)
  );

-- Deliberately no DELETE policy: membership is soft-deleted (removed_at) so
-- that expenses keep pointing at a real member row.

-- Guards what a non-owner is allowed to change about their own membership.
create or replace function public.guard_trip_member_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_trip_owner(new.trip_id) then
    -- The owner's own membership must stay an owner membership.
    if old.role = 'owner' and new.role <> 'owner' then
      raise exception 'ไม่สามารถเปลี่ยนบทบาทของเจ้าของทริปได้' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.trip_id <> old.trip_id
     or new.user_id is distinct from old.user_id
     or new.role <> old.role
     or new.removed_at is distinct from old.removed_at then
    raise exception 'แก้ไขได้เฉพาะชื่อที่แสดงของตัวเองเท่านั้น' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trip_members_guard_update
  before update on public.trip_members
  for each row execute function public.guard_trip_member_update();

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------

alter table public.expenses enable row level security;

create policy expenses_select_members on public.expenses
  for select to authenticated
  using (public.is_active_trip_member(trip_id));

create policy expenses_insert_members on public.expenses
  for insert to authenticated
  with check (public.is_active_trip_member(trip_id) and created_by = auth.uid());

create policy expenses_update_members on public.expenses
  for update to authenticated
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

-- No DELETE policy: expenses are soft-deleted (deleted_at) to preserve
-- financial history. public.purge_trip() handles a full trip deletion.

-- ---------------------------------------------------------------------------
-- expense_splits
-- ---------------------------------------------------------------------------

alter table public.expense_splits enable row level security;

create policy expense_splits_select_members on public.expense_splits
  for select to authenticated
  using (public.is_active_trip_member(trip_id));

create policy expense_splits_insert_members on public.expense_splits
  for insert to authenticated
  with check (public.is_active_trip_member(trip_id));

create policy expense_splits_update_members on public.expense_splits
  for update to authenticated
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

create policy expense_splits_delete_members on public.expense_splits
  for delete to authenticated
  using (public.is_active_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- settlements
-- ---------------------------------------------------------------------------

alter table public.settlements enable row level security;

create policy settlements_select_members on public.settlements
  for select to authenticated
  using (public.is_active_trip_member(trip_id));

create policy settlements_insert_members on public.settlements
  for insert to authenticated
  with check (public.is_active_trip_member(trip_id) and created_by = auth.uid());

create policy settlements_update_members on public.settlements
  for update to authenticated
  using (public.is_active_trip_member(trip_id))
  with check (public.is_active_trip_member(trip_id));

create policy settlements_delete_members on public.settlements
  for delete to authenticated
  using (public.is_active_trip_member(trip_id));
