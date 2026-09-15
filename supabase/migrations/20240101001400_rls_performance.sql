-- TripMate :: make authorization cost one lookup per query, not one per row
--
-- Every policy so far read `public.is_active_trip_member(trip_id)`. Because the
-- argument is a column, the planner has to evaluate it once for every candidate
-- row, and because the helper is SECURITY DEFINER it can never be inlined: each
-- evaluation is a real function call that runs a two-table EXISTS and parses the
-- JWT claims JSON through auth.uid().
--
-- Measured on this schema with 403 trips, of which 12 are mine:
--   select ... from trips order by created_at desc
--     -> Seq Scan, Rows Removed by Filter: 391, shared hit=1416, 4.6 ms
--     -> 403 executions of the helper's inner query, for 12 rows of output
--
-- The cost therefore grew with the number of trips *everyone* had, not with the
-- number the signed-in user could see. The rewrite below compares the row's
-- trip_id against a set that has no reference to the outer row, so the planner
-- builds it once per query as a hashed SubPlan and probes it per row.
--
-- auth.uid() is likewise wrapped in a scalar subquery so it is evaluated once
-- rather than per row.

-- ---------------------------------------------------------------------------
-- set-returning membership helpers
-- ---------------------------------------------------------------------------

/** Every trip the caller is an active member of. */
create or replace function public.my_trip_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.trip_id
  from public.trip_members m
  join public.trips t on t.id = m.trip_id
  where m.user_id = (select auth.uid())
    and m.removed_at is null
    and t.deleted_at is null;
$$;

/** Every trip the caller owns. */
create or replace function public.my_owned_trip_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id
  from public.trips t
  where t.owner_id = (select auth.uid())
    and t.deleted_at is null;
$$;

/** Everyone the caller shares an active trip with, including the caller. */
create or replace function public.my_co_traveller_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct theirs.user_id
  from public.trip_members mine
  join public.trip_members theirs on theirs.trip_id = mine.trip_id
  where mine.user_id = (select auth.uid())
    and mine.removed_at is null
    and theirs.removed_at is null
    and theirs.user_id is not null;
$$;

revoke all on function public.my_trip_ids() from public, anon;
revoke all on function public.my_owned_trip_ids() from public, anon;
revoke all on function public.my_co_traveller_ids() from public, anon;
grant execute on function public.my_trip_ids() to authenticated;
grant execute on function public.my_owned_trip_ids() to authenticated;
grant execute on function public.my_co_traveller_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_self_or_co_traveller on public.profiles;
create policy profiles_select_self_or_co_traveller on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id in (select public.my_co_traveller_ids()));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------

drop policy if exists trips_select_members on public.trips;
create policy trips_select_members on public.trips
  for select to authenticated
  using (id in (select public.my_trip_ids()));

drop policy if exists trips_insert_owner on public.trips;
create policy trips_insert_owner on public.trips
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists trips_update_owner on public.trips;
create policy trips_update_owner on public.trips
  for update to authenticated
  using (deleted_at is null and owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- trip_currencies
-- ---------------------------------------------------------------------------

drop policy if exists trip_currencies_select_members on public.trip_currencies;
create policy trip_currencies_select_members on public.trip_currencies
  for select to authenticated
  using (trip_id in (select public.my_trip_ids()));

drop policy if exists trip_currencies_insert_members on public.trip_currencies;
create policy trip_currencies_insert_members on public.trip_currencies
  for insert to authenticated
  with check (trip_id in (select public.my_trip_ids()));

drop policy if exists trip_currencies_update_members on public.trip_currencies;
create policy trip_currencies_update_members on public.trip_currencies
  for update to authenticated
  using (trip_id in (select public.my_trip_ids()))
  with check (trip_id in (select public.my_trip_ids()));

drop policy if exists trip_currencies_delete_owner on public.trip_currencies;
create policy trip_currencies_delete_owner on public.trip_currencies
  for delete to authenticated
  using (trip_id in (select public.my_owned_trip_ids()));

-- ---------------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------------

drop policy if exists trip_members_select_members on public.trip_members;
create policy trip_members_select_members on public.trip_members
  for select to authenticated
  using (trip_id in (select public.my_trip_ids()));

drop policy if exists trip_members_update_self_or_owner on public.trip_members;
create policy trip_members_update_self_or_owner on public.trip_members
  for update to authenticated
  using (
    trip_id in (select public.my_owned_trip_ids())
    or (user_id = (select auth.uid()) and removed_at is null)
  )
  with check (
    trip_id in (select public.my_owned_trip_ids())
    or (user_id = (select auth.uid()) and removed_at is null)
  );

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------

drop policy if exists expenses_select_members on public.expenses;
create policy expenses_select_members on public.expenses
  for select to authenticated
  using (trip_id in (select public.my_trip_ids()));

drop policy if exists expenses_insert_members on public.expenses;
create policy expenses_insert_members on public.expenses
  for insert to authenticated
  with check (trip_id in (select public.my_trip_ids()) and created_by = (select auth.uid()));

drop policy if exists expenses_update_members on public.expenses;
create policy expenses_update_members on public.expenses
  for update to authenticated
  using (trip_id in (select public.my_trip_ids()))
  with check (trip_id in (select public.my_trip_ids()));

-- ---------------------------------------------------------------------------
-- expense_splits
-- ---------------------------------------------------------------------------

drop policy if exists expense_splits_select_members on public.expense_splits;
create policy expense_splits_select_members on public.expense_splits
  for select to authenticated
  using (trip_id in (select public.my_trip_ids()));

drop policy if exists expense_splits_insert_members on public.expense_splits;
create policy expense_splits_insert_members on public.expense_splits
  for insert to authenticated
  with check (trip_id in (select public.my_trip_ids()));

drop policy if exists expense_splits_update_members on public.expense_splits;
create policy expense_splits_update_members on public.expense_splits
  for update to authenticated
  using (trip_id in (select public.my_trip_ids()))
  with check (trip_id in (select public.my_trip_ids()));

drop policy if exists expense_splits_delete_members on public.expense_splits;
create policy expense_splits_delete_members on public.expense_splits
  for delete to authenticated
  using (trip_id in (select public.my_trip_ids()));

-- ---------------------------------------------------------------------------
-- settlements
-- ---------------------------------------------------------------------------

drop policy if exists settlements_select_members on public.settlements;
create policy settlements_select_members on public.settlements
  for select to authenticated
  using (trip_id in (select public.my_trip_ids()));

drop policy if exists settlements_insert_members on public.settlements;
create policy settlements_insert_members on public.settlements
  for insert to authenticated
  with check (trip_id in (select public.my_trip_ids()) and created_by = (select auth.uid()));

drop policy if exists settlements_update_members on public.settlements;
create policy settlements_update_members on public.settlements
  for update to authenticated
  using (trip_id in (select public.my_trip_ids()))
  with check (trip_id in (select public.my_trip_ids()));

drop policy if exists settlements_delete_members on public.settlements;
create policy settlements_delete_members on public.settlements
  for delete to authenticated
  using (trip_id in (select public.my_trip_ids()));

-- ---------------------------------------------------------------------------
-- itinerary
-- ---------------------------------------------------------------------------

drop policy if exists itinerary_days_select on public.itinerary_days;
create policy itinerary_days_select on public.itinerary_days
  for select to authenticated using (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_days_insert on public.itinerary_days;
create policy itinerary_days_insert on public.itinerary_days
  for insert to authenticated with check (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_days_update on public.itinerary_days;
create policy itinerary_days_update on public.itinerary_days
  for update to authenticated
  using (trip_id in (select public.my_trip_ids()))
  with check (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_days_delete on public.itinerary_days;
create policy itinerary_days_delete on public.itinerary_days
  for delete to authenticated using (trip_id in (select public.my_trip_ids()));

drop policy if exists itinerary_stops_select on public.itinerary_stops;
create policy itinerary_stops_select on public.itinerary_stops
  for select to authenticated using (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_stops_insert on public.itinerary_stops;
create policy itinerary_stops_insert on public.itinerary_stops
  for insert to authenticated with check (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_stops_update on public.itinerary_stops;
create policy itinerary_stops_update on public.itinerary_stops
  for update to authenticated
  using (trip_id in (select public.my_trip_ids()))
  with check (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_stops_delete on public.itinerary_stops;
create policy itinerary_stops_delete on public.itinerary_stops
  for delete to authenticated using (trip_id in (select public.my_trip_ids()));

drop policy if exists itinerary_legs_select on public.itinerary_leg_preferences;
create policy itinerary_legs_select on public.itinerary_leg_preferences
  for select to authenticated using (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_legs_insert on public.itinerary_leg_preferences;
create policy itinerary_legs_insert on public.itinerary_leg_preferences
  for insert to authenticated with check (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_legs_update on public.itinerary_leg_preferences;
create policy itinerary_legs_update on public.itinerary_leg_preferences
  for update to authenticated
  using (trip_id in (select public.my_trip_ids()))
  with check (trip_id in (select public.my_trip_ids()));
drop policy if exists itinerary_legs_delete on public.itinerary_leg_preferences;
create policy itinerary_legs_delete on public.itinerary_leg_preferences
  for delete to authenticated using (trip_id in (select public.my_trip_ids()));

drop policy if exists itinerary_route_cache_select on public.itinerary_route_cache;
create policy itinerary_route_cache_select on public.itinerary_route_cache
  for select to authenticated using (trip_id in (select public.my_trip_ids()));

-- ---------------------------------------------------------------------------
-- indexes the itinerary queries were missing
-- ---------------------------------------------------------------------------
-- getItinerary() reads stops and leg preferences by trip_id. Neither table had
-- an index on that column, so both were sequential scans of every row in the
-- table on every load of แผนการเดินทาง.

create index if not exists itinerary_stops_trip_idx
  on public.itinerary_stops (trip_id)
  where deleted_at is null;

create index if not exists itinerary_legs_trip_idx
  on public.itinerary_leg_preferences (trip_id);
