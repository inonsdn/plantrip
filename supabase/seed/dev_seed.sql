-- TripMate :: development seed (a 4-day Singapore trip)
--
-- NEVER run this against production. It attaches a demo trip to the most
-- recently created auth user, so: sign in to the app once, then run
--   psql "$DATABASE_URL" -f supabase/seed/dev_seed.sql
-- (or `supabase db execute --file supabase/seed/dev_seed.sql`).
--
-- Non is the owner and is linked to your account. Mew and Praew are seeded as
-- members without a user account; they can claim their own seat later by
-- opening the invitation link (which creates their own membership row).
--
-- Amounts below are the exact values the unit tests assert
-- (tests/fixtures/singapore-trip.ts): base THB, 1 SGD = 26 THB, total ฿52,308.

do $$
declare
  v_owner uuid;
  v_trip uuid;
  v_non uuid;
  v_mew uuid;
  v_praew uuid;
  v_expense uuid;
begin
  select id into v_owner from auth.users order by created_at desc limit 1;

  if v_owner is null then
    raise exception 'ยังไม่มีผู้ใช้ในระบบ กรุณาเข้าสู่ระบบด้วย Google หนึ่งครั้งก่อนรัน seed';
  end if;

  -- Re-runnable: clear a previous demo trip in dependency order, because the
  -- "same trip" foreign keys are ON DELETE RESTRICT on purpose.
  for v_trip in
    select id from public.trips where owner_id = v_owner and name = 'ทริปสิงคโปร์ 4 วัน (เดโม)'
  loop
    delete from public.expense_splits where trip_id = v_trip;
    delete from public.settlements where trip_id = v_trip;
    delete from public.expenses where trip_id = v_trip;
    delete from public.trip_members where trip_id = v_trip;
    delete from public.trip_currencies where trip_id = v_trip;
    delete from public.trips where id = v_trip;
  end loop;

  insert into public.trips (owner_id, name, destination, start_date, end_date, base_currency)
  values (v_owner, 'ทริปสิงคโปร์ 4 วัน (เดโม)', 'สิงคโปร์', '2025-03-14', '2025-03-17', 'THB')
  returning id into v_trip;

  insert into public.trip_currencies (trip_id, currency_code, default_exchange_rate)
  values (v_trip, 'THB', 1), (v_trip, 'SGD', 26);

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip, v_owner, 'นนท์', 'owner')
  returning id into v_non;

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip, null, 'มิว', 'member')
  returning id into v_mew;

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip, null, 'แพรว', 'member')
  returning id into v_praew;

  -- 1. Pre-trip flight, already settled between friends -> excluded from settlement.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, notes, created_by, updated_by
  ) values (
    v_trip, 'ตั๋วเครื่องบินไป-กลับ (จ่ายก่อนเดินทาง เคลียร์กันแล้ว)', 'transport', '2025-02-10', 0,
    24000, 'THB', 1, 24000, v_non, false, 'โอนคืนนนท์ครบแล้วตั้งแต่ก่อนเดินทาง', v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_non, 'equal', 8000),
         (v_expense, v_trip, v_mew, 'equal', 8000),
         (v_expense, v_trip, v_praew, 'equal', 8000);

  -- 2. Shared hotel, paid in SGD.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'โรงแรมย่าน Bugis 3 คืน', 'lodging', '2025-03-14', 1,
    540, 'SGD', 26, 14040, v_non, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_non, 'equal', 4680),
         (v_expense, v_trip, v_mew, 'equal', 4680),
         (v_expense, v_trip, v_praew, 'equal', 4680);

  -- 3. Shared meal with an indivisible satang.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'ข้าวเย็นวันแรก ร้าน Chicken Rice', 'food', '2025-03-14', 1,
    96.50, 'SGD', 26, 2509, v_praew, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_non, 'equal', 836.34),
         (v_expense, v_trip, v_mew, 'equal', 836.33),
         (v_expense, v_trip, v_praew, 'equal', 836.33);

  -- 4. Tickets shared by two members only.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'ตั๋ว Universal Studios (เฉพาะมิวกับแพรว)', 'tickets', '2025-03-15', 2,
    166, 'SGD', 26, 4316, v_mew, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_mew, 'equal', 2158),
         (v_expense, v_trip, v_praew, 'equal', 2158);

  -- 5. Transport where everyone tapped their own card -> no payer, no debt.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, notes, created_by, updated_by
  ) values (
    v_trip, 'ค่ารถ MRT (ต่างคนต่างจ่ายเอง)', 'transport', '2025-03-15', 2,
    300, 'THB', 1, 300, null, false, 'แต่ละคนแตะบัตรของตัวเอง', v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_non, 'equal', 100),
         (v_expense, v_trip, v_mew, 'equal', 100),
         (v_expense, v_trip, v_praew, 'equal', 100);

  -- 6. Shared lunch.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'ข้าวกลางวันวันที่สอง', 'food', '2025-03-15', 2,
    63, 'SGD', 26, 1638, v_non, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_non, 'equal', 546),
         (v_expense, v_trip, v_mew, 'equal', 546),
         (v_expense, v_trip, v_praew, 'equal', 546);

  -- 7. Personal food expense.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'บิงซูของมิว (กินคนเดียว)', 'dessert', '2025-03-15', 2,
    12.50, 'SGD', 26, 325, v_mew, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_mew, 'personal', 325);

  -- 8. Personal shopping.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'ของฝากที่แพรวซื้อเอง', 'souvenir', '2025-03-16', 3,
    45, 'SGD', 26, 1170, v_praew, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_praew, 'personal', 1170);

  -- 9. Shared dinner split 2:1:1.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'ข้าวเย็นวันที่สาม (นนท์กินเยอะกว่า หาร 2:1:1)', 'food', '2025-03-16', 3,
    120, 'SGD', 26, 3120, v_non, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, share_value, amount_base)
  values (v_expense, v_trip, v_non, 'shares', 2, 1560),
         (v_expense, v_trip, v_mew, 'shares', 1, 780),
         (v_expense, v_trip, v_praew, 'shares', 1, 780);

  -- 10. Shared drinks in the base currency.
  insert into public.expenses (
    trip_id, description, category, expense_date, trip_day,
    original_amount, currency_code, exchange_rate, base_amount,
    payer_member_id, included_in_settlement, created_by, updated_by
  ) values (
    v_trip, 'เครื่องดื่มร้านบาร์ริมน้ำ', 'drinks', '2025-03-16', 3,
    890, 'THB', 1, 890, v_mew, true, v_owner, v_owner
  ) returning id into v_expense;
  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, amount_base)
  values (v_expense, v_trip, v_non, 'equal', 296.67),
         (v_expense, v_trip, v_mew, 'equal', 296.67),
         (v_expense, v_trip, v_praew, 'equal', 296.66);

  raise notice 'Seeded demo trip % for user % — total ฿52,308.00', v_trip, v_owner;
  raise notice 'Expected settlement: แพรว -> นนท์ ฿6,787.99 และ มิว -> นนท์ ฿4,091.00';
end;
$$;
