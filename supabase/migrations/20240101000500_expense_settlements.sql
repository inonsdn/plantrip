-- TripMate :: settle a single expense
--
-- The settlement page now lists each expense's debts individually instead of
-- one netted transfer per pair, so a settlement has to be able to say which
-- expense it cleared. Trip-level settlements keep expense_id null.

alter table public.settlements
  add column expense_id uuid;

-- Same-trip guarantee, matching the other composite foreign keys.
alter table public.settlements
  add constraint settlements_expense_same_trip
    foreign key (expense_id, trip_id)
    references public.expenses (id, trip_id)
    on delete cascade;

create index settlements_expense_idx
  on public.settlements (expense_id)
  where expense_id is not null;

-- One live payment per (expense, payer, debtor). Cancelled rows are excluded so
-- an item can be un-done and marked paid again.
create unique index settlements_expense_pair_unique
  on public.settlements (expense_id, from_member_id, to_member_id)
  where expense_id is not null and status = 'paid';
