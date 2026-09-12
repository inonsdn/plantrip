-- ---------------------------------------------------------------------------
-- save_expense: carry an optional itinerary reference.
--
-- The reference is written only when the payload actually contains the key, so
-- editing an expense through the ordinary form never clears a link it did not
-- know about. The cross-trip guard trigger still has the final say, and the
-- foreign keys are `on delete set null`: deleting a stop or a day clears the
-- link and leaves the recorded expense untouched.
-- ---------------------------------------------------------------------------

create or replace function public.save_expense(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_expense_id uuid := nullif(p_payload ->> 'expense_id', '')::uuid;
  v_trip_id uuid := (p_payload ->> 'trip_id')::uuid;
  v_base_amount numeric(16, 2) := (p_payload ->> 'base_amount')::numeric;
  v_included boolean := coalesce((p_payload ->> 'included_in_settlement')::boolean, true);
  v_payer uuid := nullif(p_payload ->> 'payer_member_id', '')::uuid;
  v_splits jsonb := coalesce(p_payload -> 'splits', '[]'::jsonb);
  v_sum numeric(16, 2);
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '28000';
  end if;

  if jsonb_array_length(v_splits) = 0 then
    raise exception 'ต้องมีสมาชิกในรายการหารอย่างน้อย 1 คน' using errcode = '22023';
  end if;

  select sum((split ->> 'amount_base')::numeric)
  into v_sum
  from jsonb_array_elements(v_splits) as split;

  if v_sum is distinct from v_base_amount then
    raise exception 'ยอดหารรวมไม่เท่ากับยอดรายการ' using errcode = '22023';
  end if;

  if v_included and v_payer is null then
    raise exception 'รายการที่นำไปคำนวณยอดโอน ต้องระบุผู้จ่าย' using errcode = '22023';
  end if;

  if v_expense_id is null then
    insert into public.expenses (
      trip_id, description, category, expense_date, trip_day,
      original_amount, currency_code, exchange_rate, base_amount,
      payer_member_id, included_in_settlement, notes, created_by, updated_by,
      itinerary_day_id, itinerary_origin_stop_id, itinerary_destination_stop_id
    )
    values (
      v_trip_id,
      p_payload ->> 'description',
      coalesce(p_payload ->> 'category', 'other'),
      (p_payload ->> 'expense_date')::date,
      nullif(p_payload ->> 'trip_day', '')::int,
      (p_payload ->> 'original_amount')::numeric,
      p_payload ->> 'currency_code',
      (p_payload ->> 'exchange_rate')::numeric,
      v_base_amount,
      v_payer,
      v_included,
      nullif(p_payload ->> 'notes', ''),
      v_uid,
      v_uid,
      nullif(p_payload ->> 'itinerary_day_id', '')::uuid,
      nullif(p_payload ->> 'itinerary_origin_stop_id', '')::uuid,
      nullif(p_payload ->> 'itinerary_destination_stop_id', '')::uuid
    )
    returning id into v_expense_id;
  else
    update public.expenses
    set description = p_payload ->> 'description',
        category = coalesce(p_payload ->> 'category', 'other'),
        expense_date = (p_payload ->> 'expense_date')::date,
        trip_day = nullif(p_payload ->> 'trip_day', '')::int,
        original_amount = (p_payload ->> 'original_amount')::numeric,
        currency_code = p_payload ->> 'currency_code',
        exchange_rate = (p_payload ->> 'exchange_rate')::numeric,
        base_amount = v_base_amount,
        payer_member_id = v_payer,
        included_in_settlement = v_included,
        notes = nullif(p_payload ->> 'notes', ''),
        updated_by = v_uid,
        itinerary_day_id = case
          when p_payload ? 'itinerary_day_id'
            then nullif(p_payload ->> 'itinerary_day_id', '')::uuid
          else itinerary_day_id
        end,
        itinerary_origin_stop_id = case
          when p_payload ? 'itinerary_origin_stop_id'
            then nullif(p_payload ->> 'itinerary_origin_stop_id', '')::uuid
          else itinerary_origin_stop_id
        end,
        itinerary_destination_stop_id = case
          when p_payload ? 'itinerary_destination_stop_id'
            then nullif(p_payload ->> 'itinerary_destination_stop_id', '')::uuid
          else itinerary_destination_stop_id
        end
    where id = v_expense_id
      and trip_id = v_trip_id
      and deleted_at is null;

    if not found then
      raise exception 'ไม่พบรายการค่าใช้จ่ายนี้' using errcode = 'P0002';
    end if;

    delete from public.expense_splits where expense_id = v_expense_id;
  end if;

  insert into public.expense_splits (expense_id, trip_id, member_id, split_method, share_value, amount_base)
  select
    v_expense_id,
    v_trip_id,
    (split ->> 'member_id')::uuid,
    coalesce(split ->> 'split_method', 'equal')::public.split_method,
    nullif(split ->> 'share_value', '')::numeric,
    (split ->> 'amount_base')::numeric
  from jsonb_array_elements(v_splits) as split;

  return v_expense_id;
end;
$$;

revoke all on function public.save_expense(jsonb) from public, anon;
grant execute on function public.save_expense(jsonb) to authenticated;
