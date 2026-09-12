-- TripMate :: only the receiver confirms that money arrived
--
-- Marking a debt paid is a claim about someone else's bank account, so the
-- person who is owed has to be the one who confirms it. Anyone else pressing
-- "โอนแล้ว" records a 'pending' claim instead, which computeBalances ignores
-- until it is confirmed.
--
-- Exception: a member added by name with no account behind them cannot confirm
-- anything, so their rows stay confirmable by whoever is doing the books.

-- Only one live record per (expense, payer, debtor) — pending now counts too,
-- so a claim cannot be filed twice.
drop index if exists public.settlements_expense_pair_unique;

create unique index settlements_expense_pair_unique
  on public.settlements (expense_id, from_member_id, to_member_id)
  where expense_id is not null and status <> 'cancelled';

create or replace function public.guard_settlement_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receiver_user uuid;
begin
  -- Only guard the transition into 'paid'; claims and cancellations are free.
  if new.status <> 'paid' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then
    return new;
  end if;

  select user_id into v_receiver_user
  from public.trip_members
  where id = new.to_member_id;

  -- A NULL auth.uid() means a trusted server-side context (migrations, seed),
  -- and a NULL receiver has no account that could confirm for itself.
  if v_receiver_user is not null and v_receiver_user <> auth.uid() then
    raise exception 'ต้องให้ผู้รับเงินเป็นคนยืนยันว่าได้รับแล้ว' using errcode = '42501';
  end if;

  if new.paid_at is null then
    new.paid_at := now();
  end if;

  return new;
end;
$$;

create trigger settlements_guard_confirmation
  before insert or update on public.settlements
  for each row execute function public.guard_settlement_confirmation();
