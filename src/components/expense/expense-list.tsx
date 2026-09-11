'use client';

import { useMemo, useState, useTransition } from 'react';
import { Ban, Pencil, ReceiptText, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/states';
import { CategoryChip } from '@/components/ui/category-icon';
import { MemberChip } from '@/components/ui/avatar';
import { Select, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { CATEGORY_LIST } from '@/lib/categories';
import { formatDateTime, formatDateWithWeekday, tripDayLabel } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { deleteExpenseAction } from '@/lib/actions/expenses';
import type { ExpenseView, TripContext } from '@/lib/types';
import { useTripUi } from '@/components/trip/trip-shell';
import { useRouter } from 'next/navigation';

type SettlementFilter = 'all' | 'included' | 'excluded';

export function ExpenseList({
  context,
  expenses,
}: {
  context: TripContext;
  expenses: ExpenseView[];
}) {
  const router = useRouter();
  const { openExpense } = useTripUi();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState('all');
  const [category, setCategory] = useState('all');
  const [day, setDay] = useState('all');
  const [settlement, setSettlement] = useState<SettlementFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [toDelete, setToDelete] = useState<ExpenseView | null>(null);

  const currency = context.trip.baseCurrency;
  const memberById = useMemo(
    () => new Map(context.allMembers.map((member) => [member.id, member])),
    [context.allMembers],
  );
  const memberByUserId = useMemo(
    () => new Map(context.allMembers.filter((m) => m.userId).map((m) => [m.userId as string, m])),
    [context.allMembers],
  );

  const dayOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const expense of expenses) {
      seen.set(expense.expenseDate, formatDateWithWeekday(expense.expenseDate));
    }
    return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [expenses]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (needle) {
        const haystack = `${expense.description} ${expense.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (memberId !== 'all') {
        const involved =
          expense.payerMemberId === memberId ||
          expense.splits.some((split) => split.memberId === memberId);
        if (!involved) return false;
      }
      if (category !== 'all' && expense.category !== category) return false;
      if (day !== 'all' && expense.expenseDate !== day) return false;
      if (settlement === 'included' && !expense.includedInSettlement) return false;
      if (settlement === 'excluded' && expense.includedInSettlement) return false;
      return true;
    });
  }, [expenses, query, memberId, category, day, settlement]);

  const groups = useMemo(() => {
    const map = new Map<string, ExpenseView[]>();
    for (const expense of filtered) {
      const list = map.get(expense.expenseDate) ?? [];
      list.push(expense);
      map.set(expense.expenseDate, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const filtersActive =
    query.trim() !== '' || memberId !== 'all' || category !== 'all' || day !== 'all' || settlement !== 'all';

  const filteredTotal = filtered.reduce((total, expense) => total + expense.baseAmountMinor, 0);

  function resetFilters() {
    setQuery('');
    setMemberId('all');
    setCategory('all');
    setDay('all');
    setSettlement('all');
  }

  function confirmDelete() {
    if (!toDelete) return;
    const target = toDelete;
    startTransition(async () => {
      const result = await deleteExpenseAction(context.trip.id, target.id);
      setToDelete(null);
      showToast({
        message: result.ok ? 'ลบรายการเรียบร้อย' : result.error,
        tone: result.ok ? 'success' : 'error',
      });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหารายการ"
            aria-label="ค้นหารายการค่าใช้จ่าย"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant={showFilters || filtersActive ? 'primary' : 'secondary'}
          onClick={() => setShowFilters((current) => !current)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">ตัวกรอง</span>
        </Button>
      </div>

      {showFilters ? (
        <Card>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">สมาชิก</span>
                <Select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                  <option value="all">ทุกคน</option>
                  {context.allMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                      {member.removedAt ? ' (ออกแล้ว)' : ''}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">หมวดหมู่</span>
                <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="all">ทุกหมวดหมู่</option>
                  {CATEGORY_LIST.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">วันที่</span>
                <Select value={day} onChange={(event) => setDay(event.target.value)}>
                  <option value="all">ทุกวัน</option>
                  {dayOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-ink">การคำนวณยอดโอน</span>
                <Select
                  value={settlement}
                  onChange={(event) => setSettlement(event.target.value as SettlementFilter)}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="included">นำไปคำนวณ</option>
                  <option value="excluded">ไม่นำไปคำนวณ</option>
                </Select>
              </label>
            </div>

            {filtersActive ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                <X aria-hidden className="size-4" />
                ล้างตัวกรอง
              </Button>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <p className="text-sm text-muted">
        แสดง {filtered.length} จาก {expenses.length} รายการ · รวม{' '}
        <span className="tabular font-semibold text-ink">{formatMoney(filteredTotal, currency)}</span>
      </p>

      {groups.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden className="size-8" />}
          title={filtersActive ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีค่าใช้จ่าย'}
          description={
            filtersActive
              ? 'ลองล้างตัวกรอง หรือเปลี่ยนคำค้นหา'
              : 'กดปุ่ม “เพิ่มค่าใช้จ่าย” เพื่อบันทึกรายการแรก'
          }
          action={
            filtersActive ? (
              <Button type="button" variant="secondary" onClick={resetFilters}>
                ล้างตัวกรอง
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([date, items]) => {
            const dayTotal = items.reduce((total, expense) => total + expense.baseAmountMinor, 0);
            return (
              <section key={date}>
                <div className="sticky top-14 z-10 -mx-4 flex items-baseline justify-between gap-2 bg-canvas/95 px-4 py-1.5 backdrop-blur sm:top-0 sm:mx-0 sm:px-0">
                  <h2 className="text-sm font-semibold text-ink">
                    {formatDateWithWeekday(date)}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {tripDayLabel(items[0].tripDay)}
                    </span>
                  </h2>
                  <span className="tabular text-sm font-medium text-ink-soft">
                    {formatMoney(dayTotal, currency)}
                  </span>
                </div>

                <ul className="mt-1.5 space-y-2">
                  {items.map((expense) => {
                    const payer = expense.payerMemberId ? memberById.get(expense.payerMemberId) : null;
                    const editor = expense.updatedBy ? memberByUserId.get(expense.updatedBy) : null;
                    return (
                      <li key={expense.id}>
                        <article className="rounded-xl border border-line bg-surface p-3 shadow-sm shadow-ink/[0.03]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-semibold text-ink">
                                {expense.description}
                              </h3>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <CategoryChip category={expense.category} />
                                {!expense.includedInSettlement ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-1.5 py-0.5 text-xs text-muted">
                                    <Ban aria-hidden className="size-3.5" />
                                    ไม่คิดยอดโอน
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="tabular text-base font-semibold text-ink">
                                {formatMoney(expense.baseAmountMinor, currency)}
                              </p>
                              {expense.currencyCode !== currency ? (
                                <p className="tabular text-xs text-muted">
                                  {expense.originalAmount} {expense.currencyCode} @ {expense.exchangeRate}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <dl className="mt-2.5 space-y-1.5 text-xs text-muted">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <dt className="shrink-0">ผู้จ่าย:</dt>
                              <dd>
                                {payer ? (
                                  <MemberChip
                                    name={payer.displayName}
                                    avatarUrl={payer.avatarUrl}
                                    removed={payer.removedAt !== null}
                                  />
                                ) : (
                                  <span className="text-ink-soft">ทุกคนจ่ายเอง</span>
                                )}
                              </dd>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <dt className="shrink-0">หารกับ:</dt>
                              <dd className="flex flex-wrap gap-1">
                                {expense.splits.map((split) => {
                                  const member = memberById.get(split.memberId);
                                  if (!member) return null;
                                  return (
                                    <span key={split.memberId} className="inline-flex items-center gap-1">
                                      <MemberChip
                                        name={`${member.displayName} · ${formatMoney(split.amountMinor, currency)}`}
                                        avatarUrl={member.avatarUrl}
                                        removed={member.removedAt !== null}
                                      />
                                    </span>
                                  );
                                })}
                              </dd>
                            </div>
                            {expense.notes ? (
                              <div>
                                <dt className="sr-only">บันทึกเพิ่มเติม</dt>
                                <dd className="text-ink-soft">{expense.notes}</dd>
                              </div>
                            ) : null}
                            {editor ? (
                              <div>
                                <dt className="sr-only">แก้ไขล่าสุด</dt>
                                <dd>
                                  แก้ไขล่าสุดโดย {editor.displayName} · {formatDateTime(expense.updatedAt)}
                                </dd>
                              </div>
                            ) : null}
                          </dl>

                          <div className="mt-3 flex justify-end gap-2 border-t border-line pt-2.5">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openExpense(expense)}
                            >
                              <Pencil aria-hidden className="size-4" />
                              แก้ไข
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => setToDelete(expense)}
                            >
                              <Trash2 aria-hidden className="size-4" />
                              ลบ
                            </Button>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="ลบรายการนี้?"
        description={
          toDelete ? (
            <>
              <span className="font-medium text-ink">{toDelete.description}</span> ·{' '}
              {formatMoney(toDelete.baseAmountMinor, currency)}
              <br />
              ยอดโอนของทุกคนจะถูกคำนวณใหม่ทันที
            </>
          ) : null
        }
        confirmLabel={pending ? 'กำลังลบ…' : 'ลบรายการ'}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
