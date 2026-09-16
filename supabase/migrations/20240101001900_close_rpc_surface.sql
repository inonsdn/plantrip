-- TripMate :: nothing is an API unless it was meant to be one
--
-- PostgREST publishes every function in the `public` schema at
-- /rest/v1/rpc/<name>, so a function is reachable from the internet the moment
-- a role holds EXECUTE on it. Supabase's own linter found seven SECURITY
-- DEFINER functions callable by `anon` — the trigger functions, which are not
-- an API at all, and the three row level security helpers, which are the
-- machinery behind the policies rather than something to call.
--
-- None of this was exploitable on its own: the helpers read auth.uid() and
-- answer false for a caller who is not signed in, and a trigger function
-- invoked directly refuses to run outside a trigger. It is surface that should
-- not exist, and it costs nothing to remove.
--
-- Nothing depends on those grants. No policy has referenced the three helpers
-- since 1400 rewrote every policy to use my_trip_ids(), and a trigger runs as
-- the table's owner rather than as the caller.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.guard_trip_member_update() from public, anon, authenticated;
revoke all on function public.guard_settlement_confirmation() from public, anon, authenticated;
revoke all on function public.guard_expense_itinerary_reference() from public, anon, authenticated;

revoke all on function public.is_active_trip_member(uuid) from public, anon, authenticated;
revoke all on function public.is_trip_owner(uuid) from public, anon, authenticated;
revoke all on function public.shares_active_trip_with(uuid) from public, anon, authenticated;

-- The set-returning helpers the policies do use. A policy is evaluated as the
-- caller, so authenticated keeps EXECUTE; anon never needs it.
revoke all on function public.my_trip_ids() from public, anon;
revoke all on function public.my_owned_trip_ids() from public, anon;
revoke all on function public.my_co_traveller_ids() from public, anon;

-- A function with no pinned search_path resolves its references against
-- whatever the caller's search_path happens to be.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.generate_invite_token() set search_path = public, extensions, pg_temp;
