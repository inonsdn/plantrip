-- TripMate :: enforceable ceiling on outbound routing calls
--
-- An in-memory rate limit does not survive serverless instances, so the budget
-- that actually protects against provider charges lives in the database and is
-- consumed atomically.

create table public.itinerary_request_budget (
  budget_date date primary key,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.itinerary_request_budget enable row level security;
-- No policies: only the SECURITY DEFINER function below touches this table.

/**
 * Consumes one unit of today's routing budget.
 *
 * Returns false once the ceiling is reached, which the caller must surface as
 * 'quota_exhausted' rather than retrying. The increment and the check are one
 * atomic statement, so parallel requests cannot both slip past the limit.
 */
create or replace function public.consume_itinerary_budget(p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;

  insert into public.itinerary_request_budget (budget_date, request_count)
  values (current_date, 1)
  on conflict (budget_date) do update
    set request_count = public.itinerary_request_budget.request_count + 1,
        updated_at = now()
    where public.itinerary_request_budget.request_count < p_daily_limit
  returning request_count into v_count;

  -- No row returned means the WHERE clause blocked the increment: over budget.
  return v_count is not null;
end;
$$;

revoke all on function public.consume_itinerary_budget(integer) from public, anon;
grant execute on function public.consume_itinerary_budget(integer) to authenticated;
