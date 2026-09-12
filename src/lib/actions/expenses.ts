'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../supabase/server';
import { getTripContext } from '../queries/trips';
import { convertToBaseMinor, fromMinorUnits, toMinorUnits } from '../money';
import { computeSplits, SplitError } from '../split';
import { expenseInputSchema, fieldErrors } from '../validation';
import { fail, friendlyError, ok, type ActionResult } from './result';

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`, 'layout');
  revalidatePath('/trips');
}

export async function saveExpenseAction(
  input: unknown,
): Promise<ActionResult<{ expenseId: string }>> {
  const parsed = expenseInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail('ข้อมูลค่าใช้จ่ายไม่ถูกต้อง', fieldErrors(parsed.error));
  }
  const value = parsed.data;

  const context = await getTripContext(value.tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  // Server-side authorization: a payer or split member from another trip is
  // rejected here, not just hidden in the UI. Members who have left the trip
  // stay valid so their existing expenses remain editable.
  const tripMemberIds = new Set(context.allMembers.map((member) => member.id));
  if (value.payerMemberId && !tripMemberIds.has(value.payerMemberId)) {
    return fail('ผู้จ่ายไม่ได้เป็นสมาชิกของทริปนี้');
  }
  if (value.participants.some((participant) => !tripMemberIds.has(participant.memberId))) {
    return fail('มีสมาชิกในรายการหารที่ไม่ได้อยู่ในทริปนี้');
  }

  const baseCurrency = context.trip.baseCurrency;

  let baseAmountMinor: number;
  try {
    baseAmountMinor = convertToBaseMinor(
      value.amount,
      value.currencyCode,
      value.exchangeRate,
      baseCurrency,
    );
  } catch (error) {
    return fail(friendlyError(error, 'แปลงสกุลเงินไม่สำเร็จ'));
  }

  if (baseAmountMinor <= 0) {
    return fail('ยอดเงินหลังแปลงสกุลต้องมากกว่า 0', { amount: 'ยอดเงินต้องมากกว่า 0' });
  }

  let lines;
  try {
    lines = computeSplits(
      value.splitMethod,
      baseAmountMinor,
      value.participants.map((participant) => ({
        memberId: participant.memberId,
        value:
          value.splitMethod === 'exact' && participant.value
            ? toMinorUnits(participant.value, baseCurrency)
            : participant.value,
      })),
    );
  } catch (error) {
    const message = error instanceof SplitError ? error.message : friendlyError(error);
    return fail(message, { participants: message });
  }

  const supabase = await createSupabaseServerClient();

  // Remember the rate used for this currency so the next entry defaults to it.
  if (value.currencyCode !== baseCurrency) {
    await supabase.from('trip_currencies').upsert(
      {
        trip_id: value.tripId,
        currency_code: value.currencyCode,
        default_exchange_rate: value.exchangeRate,
      },
      { onConflict: 'trip_id,currency_code' },
    );
  }

  const { data, error } = await supabase.rpc('save_expense', {
    p_payload: {
      expense_id: value.expenseId ?? null,
      trip_id: value.tripId,
      description: value.description,
      category: value.category,
      expense_date: value.expenseDate,
      trip_day: value.tripDay ?? null,
      original_amount: value.amount,
      currency_code: value.currencyCode,
      exchange_rate: value.exchangeRate,
      base_amount: fromMinorUnits(baseAmountMinor, baseCurrency),
      payer_member_id: value.payerMemberId,
      included_in_settlement: value.includedInSettlement,
      notes: value.notes ?? null,
      ...(value.itineraryDayId !== undefined
        ? { itinerary_day_id: value.itineraryDayId }
        : {}),
      ...(value.itineraryOriginStopId !== undefined
        ? { itinerary_origin_stop_id: value.itineraryOriginStopId }
        : {}),
      ...(value.itineraryDestinationStopId !== undefined
        ? { itinerary_destination_stop_id: value.itineraryDestinationStopId }
        : {}),
      splits: lines.map((line) => ({
        member_id: line.memberId,
        split_method: line.splitMethod,
        share_value: line.shareValue,
        amount_base: fromMinorUnits(line.amountMinor, baseCurrency),
      })),
    },
  });

  if (error || !data) return fail(friendlyError(error, 'บันทึกค่าใช้จ่ายไม่สำเร็จ'));

  revalidateTrip(value.tripId);
  return ok({ expenseId: data });
}

export async function deleteExpenseAction(
  tripId: string,
  expenseId: string,
): Promise<ActionResult> {
  const context = await getTripContext(tripId);
  if (!context) return fail('ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง');

  const supabase = await createSupabaseServerClient();
  // Soft delete: the row stays so history and audits remain intact.
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('trip_id', tripId)
    .is('deleted_at', null);

  if (error) return fail(friendlyError(error, 'ลบค่าใช้จ่ายไม่สำเร็จ'));

  revalidateTrip(tripId);
  return ok(undefined);
}
