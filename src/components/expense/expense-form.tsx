'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { CATEGORY_LIST } from '@/lib/categories';
import { COMMON_CURRENCIES } from '@/lib/currencies';
import { tripDayFor, todayDateOnly, tripDayLabel } from '@/lib/format';
import { convertToBaseMinor, formatMoney, fromMinorUnits } from '@/lib/money';
import { type SplitMethod } from '@/lib/split';
import { suggestCategory } from '@/lib/categories';
import { saveExpenseAction, deleteExpenseAction } from '@/lib/actions/expenses';
import type { ExpenseView, TripContext } from '@/lib/types';
import { SplitEditor, useSplitPreview } from './split-editor';

const LAST_CURRENCY_KEY = 'tripmate:last-currency';
const LAST_PAYER_KEY = 'tripmate:last-payer';
const NO_PAYER = '__none__';

function readDeviceMemory(key: string, tripId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${key}:${tripId}`);
  } catch {
    return null;
  }
}

function writeDeviceMemory(key: string, tripId: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${key}:${tripId}`, value);
  } catch {
    // Private mode or storage disabled — device memory is a convenience only.
  }
}

export function ExpenseForm({
  context,
  expense,
  onDone,
}: {
  context: TripContext;
  expense: ExpenseView | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const { trip, currencies, currentMember } = context;
  const isEdit = expense !== null;

  // Active members, plus anyone already on this expense who has since been
  // removed — so editing an old expense never silently drops them.
  const members = useMemo(() => {
    const keep = new Set<string>(expense ? expense.splits.map((split) => split.memberId) : []);
    if (expense?.payerMemberId) keep.add(expense.payerMemberId);
    return context.allMembers.filter(
      (member) => member.removedAt === null || keep.has(member.id),
    );
  }, [context.allMembers, expense]);

  const [amount, setAmount] = useState(expense ? expense.originalAmount : '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [payerMemberId, setPayerMemberId] = useState<string | null>(() => {
    if (expense) return expense.payerMemberId;
    const remembered = readDeviceMemory(LAST_PAYER_KEY, trip.id);
    return remembered && members.some((member) => member.id === remembered)
      ? remembered
      : currentMember.id;
  });
  const [participantIds, setParticipantIds] = useState<string[]>(
    expense ? expense.splits.map((split) => split.memberId) : members.map((member) => member.id),
  );
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(
    (expense?.splits[0]?.splitMethod as SplitMethod | undefined) ?? 'equal',
  );
  const [splitValues, setSplitValues] = useState<Record<string, string>>(() =>
    expense
      ? Object.fromEntries(
          expense.splits
            .filter((split) => split.shareValue !== null)
            .map((split) => [
              split.memberId,
              split.splitMethod === 'exact'
                ? fromMinorUnits(Number(split.shareValue), trip.baseCurrency)
                : // numeric(16,4) comes back as "50.0000"; show it as "50".
                  String(Number(split.shareValue)),
            ]),
        )
      : {},
  );
  const [category, setCategory] = useState(expense?.category ?? 'other');
  const [categoryTouched, setCategoryTouched] = useState(isEdit);
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? todayDateOnly());
  const [currencyCode, setCurrencyCode] = useState(() => {
    if (expense) return expense.currencyCode;
    const remembered = readDeviceMemory(LAST_CURRENCY_KEY, trip.id);
    return remembered ?? trip.baseCurrency;
  });
  const [exchangeRate, setExchangeRate] = useState(() => {
    if (expense) return expense.exchangeRate;
    const remembered = readDeviceMemory(LAST_CURRENCY_KEY, trip.id) ?? trip.baseCurrency;
    if (remembered === trip.baseCurrency) return '1';
    return currencies.find((currency) => currency.code === remembered)?.rate ?? '1';
  });
  const [excludeFromSettlement, setExcludeFromSettlement] = useState(
    expense ? !expense.includedInSettlement : false,
  );
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  const currencyOptions = useMemo(() => {
    const codes = new Set<string>([trip.baseCurrency, ...currencies.map((currency) => currency.code)]);
    const extras = COMMON_CURRENCIES.filter((currency) => !codes.has(currency.code));
    return [
      ...[...codes].map((code) => ({
        code,
        label: COMMON_CURRENCIES.find((currency) => currency.code === code)?.label ?? code,
        inTrip: true,
      })),
      ...extras.map((currency) => ({ ...currency, inTrip: false })),
    ];
  }, [currencies, trip.baseCurrency]);

  const baseAmountMinor = useMemo(() => {
    if (!amount.trim()) return 0;
    try {
      return convertToBaseMinor(amount, currencyCode, exchangeRate, trip.baseCurrency);
    } catch {
      return 0;
    }
  }, [amount, currencyCode, exchangeRate, trip.baseCurrency]);

  const preview = useSplitPreview(
    splitMethod,
    baseAmountMinor,
    participantIds,
    splitValues,
    trip.baseCurrency,
  );

  function toggleParticipant(memberId: string) {
    setParticipantIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      // Keep the trip's member order so split maths stays deterministic.
      return members.filter((member) => next.has(member.id)).map((member) => member.id);
    });
  }

  function selectOnly(memberId: string) {
    setParticipantIds([memberId]);
  }

  function selectAllMembers() {
    setParticipantIds(members.map((member) => member.id));
  }

  function clearParticipants() {
    setParticipantIds([]);
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    if (!categoryTouched) {
      const suggested = suggestCategory(value);
      setCategory(suggested ?? 'other');
    }
  }

  function handleDateChange(value: string) {
    setExpenseDate(value);
  }

  function handleCurrencyChange(next: string) {
    setCurrencyCode(next);
    if (next === trip.baseCurrency) {
      setExchangeRate('1');
      return;
    }
    setExchangeRate(currencies.find((currency) => currency.code === next)?.rate ?? '1');
  }

  function handleMethodChange(next: SplitMethod) {
    setSplitMethod(next);
    if (next === 'personal') {
      setParticipantIds((current) => [current[0] ?? payerMemberId ?? currentMember.id]);
    } else if (participantIds.length === 0) {
      setParticipantIds(members.map((member) => member.id));
    }
    if (next === 'shares') {
      setSplitValues((current) => {
        const next2 = { ...current };
        for (const memberId of participantIds) if (!next2[memberId]) next2[memberId] = '1';
        return next2;
      });
    }
  }

  function handlePayerChange(value: string) {
    if (value === NO_PAYER) {
      setPayerMemberId(null);
      setExcludeFromSettlement(true);
      return;
    }
    setPayerMemberId(value);
  }

  // Derived from the date now that the manual day picker is gone.
  const tripDay = useMemo(
    () => tripDayFor(expenseDate, trip.startDate),
    [expenseDate, trip.startDate],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldError({});

    if (preview.error) {
      setFormError(preview.error);
      return;
    }

    const input = {
      tripId: trip.id,
      expenseId: expense?.id ?? null,
      description: description.trim(),
      category,
      amount: amount.trim(),
      currencyCode,
      exchangeRate: currencyCode === trip.baseCurrency ? '1' : exchangeRate.trim(),
      expenseDate,
      tripDay,
      payerMemberId,
      includedInSettlement: !excludeFromSettlement,
      notes: notes.trim() ? notes.trim() : null,
      splitMethod,
      participants: participantIds.map((memberId) => ({
        memberId,
        value: splitValues[memberId] ?? null,
      })),
    };

    startTransition(async () => {
      const result = await saveExpenseAction(input);
      if (!result.ok) {
        setFormError(result.error);
        setFieldError(result.fieldErrors ?? {});
        return;
      }

      writeDeviceMemory(LAST_CURRENCY_KEY, trip.id, currencyCode);
      if (payerMemberId) writeDeviceMemory(LAST_PAYER_KEY, trip.id, payerMemberId);

      const savedId = result.data.expenseId;
      showToast({
        message: isEdit ? 'แก้ไขรายการเรียบร้อย' : 'บันทึกค่าใช้จ่ายเรียบร้อย',
        tone: 'success',
        action: isEdit
          ? undefined
          : {
              label: 'เลิกทำ',
              onClick: async () => {
                const undone = await deleteExpenseAction(trip.id, savedId);
                showToast({
                  message: undone.ok ? 'ยกเลิกรายการล่าสุดแล้ว' : undone.error,
                  tone: undone.ok ? 'info' : 'error',
                });
                router.refresh();
              },
            },
      });
      onDone();
      router.refresh();
    });
  }

  const perPersonHint =
    baseAmountMinor > 0 && participantIds.length > 0 && !preview.error
      ? `คนละ ${formatMoney(Math.round(baseAmountMinor / participantIds.length), trip.baseCurrency)} โดยประมาณ`
      : null;

  return (
    <form id="expense-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* 1. หน่วยและจำนวนเงิน */}
      <Field label="หน่วยและจำนวนเงิน" htmlFor="amount" error={fieldError.amount} required>
        <div className="flex items-stretch gap-2">
          <div className="w-28 shrink-0">
            <Select
              aria-label="สกุลเงิน"
              value={currencyCode}
              onChange={(event) => handleCurrencyChange(event.target.value)}
              className="px-2"
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code}
                </option>
              ))}
            </Select>
          </div>
          <TextInput
            id="amount"
            data-autofocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            required
            className="tabular text-lg font-semibold"
          />
        </div>
      </Field>

      {currencyCode !== trip.baseCurrency ? (
        <Field
          label="อัตราแลกเปลี่ยน"
          htmlFor="exchangeRate"
          error={fieldError.exchangeRate}
          hint={
            baseAmountMinor > 0
              ? `${amount || '0'} ${currencyCode} = ${formatMoney(baseAmountMinor, trip.baseCurrency)}`
              : `1 ${currencyCode} = ? ${trip.baseCurrency}`
          }
        >
          <TextInput
            id="exchangeRate"
            value={exchangeRate}
            onChange={(event) => setExchangeRate(event.target.value)}
            inputMode="decimal"
            className="tabular"
          />
        </Field>
      ) : null}

      {/* 2. รายละเอียด */}
      <Field label="รายละเอียด" htmlFor="description" error={fieldError.description} required>
        <TextInput
          id="description"
          value={description}
          onChange={(event) => handleDescriptionChange(event.target.value)}
          placeholder="เช่น ข้าวเย็นวันแรก"
          maxLength={200}
          required
        />
      </Field>

      {/* 3. คนจ่าย */}
      <Field label="คนจ่าย" htmlFor="payer" error={fieldError.payerMemberId}>
        <Select
          id="payer"
          value={payerMemberId ?? NO_PAYER}
          onChange={(event) => handlePayerChange(event.target.value)}
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
              {member.isMe ? ' (ฉัน)' : ''}
            </option>
          ))}
          <option value={NO_PAYER}>ทุกคนจ่ายเอง (ไม่มีผู้จ่ายหลัก)</option>
        </Select>
      </Field>

      {/* 4. หารกับใคร / สัดส่วน */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">หารกับใคร / สัดส่วน</p>
          {perPersonHint ? <p className="text-xs text-muted">{perPersonHint}</p> : null}
        </div>
        <SplitEditor
          members={members}
          participantIds={participantIds}
          onToggleParticipant={toggleParticipant}
          onSelectOnly={selectOnly}
          onSelectAll={selectAllMembers}
          onClearAll={clearParticipants}
          method={splitMethod}
          onMethodChange={handleMethodChange}
          values={splitValues}
          onValueChange={(memberId, value) =>
            setSplitValues((current) => ({ ...current, [memberId]: value }))
          }
          baseCurrency={trip.baseCurrency}
          totalMinor={baseAmountMinor}
          preview={preview}
        />
        {fieldError.participants ? (
          <p role="alert" className="text-sm text-negative">
            {fieldError.participants}
          </p>
        ) : null}
      </div>

      {/* 5. เพิ่มเติม */}
      <div className="rounded-lg border border-line">
        <button
          type="button"
          onClick={() => setShowAdvanced((current) => !current)}
          aria-expanded={showAdvanced}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm font-medium text-ink-soft hover:bg-canvas"
        >
          เพิ่มเติม
          {showAdvanced ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
        </button>

        {showAdvanced ? (
          <div className="space-y-4 border-t border-line px-3 py-4">
            <Field label="หมวดหมู่" htmlFor="category">
              <Select
                id="category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setCategoryTouched(true);
                }}
              >
                {CATEGORY_LIST.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="วันที่"
              htmlFor="expenseDate"
              error={fieldError.expenseDate}
              hint={tripDay === null ? undefined : tripDayLabel(tripDay)}
            >
              <TextInput
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(event) => handleDateChange(event.target.value)}
              />
            </Field>

            <Field label="บันทึกเพิ่มเติม" htmlFor="notes" error={fieldError.notes}>
              <TextArea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
                placeholder="เช่น จ่ายผ่านบัตรเครดิตของนนท์"
              />
            </Field>

            <Checkbox
              checked={excludeFromSettlement}
              disabled={payerMemberId === null}
              onChange={(event) => setExcludeFromSettlement(event.target.checked)}
              label="ไม่นำรายการนี้ไปคำนวณยอดที่ต้องโอน"
              hint="ยอดนี้จะยังนับรวมในยอดรวมทริป หมวดหมู่ รายวัน และยอดของแต่ละคน แต่จะไม่ทำให้ใครเป็นหนี้ใคร เหมาะกับค่าใช้จ่ายที่เคลียร์กันไปแล้ว หรือรายการที่ทุกคนจ่ายเอง"
            />
          </div>
        ) : null}
      </div>

      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative"
        >
          {formError}
        </p>
      ) : null}

      {/* Sticky so the save action stays reachable with the keyboard open. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-line bg-surface px-4 py-3 sm:-mx-5 sm:-mb-4 sm:flex-row sm:justify-end sm:px-5">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'กำลังบันทึก…' : isEdit ? 'บันทึกการแก้ไข' : 'บันทึกค่าใช้จ่าย'}
        </Button>
      </div>
    </form>
  );
}
