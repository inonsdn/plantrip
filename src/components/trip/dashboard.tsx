'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  CalendarRange,
  PiggyBank,
  ReceiptText,
  Scale,
  Wallet,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { MemberAvatar } from '@/components/ui/avatar';
import { CategoryChip } from '@/components/ui/category-icon';
import { formatDateWithWeekday, tripDayLabel } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { CategoryTotal, TripStats } from '@/lib/trip-stats';
import type { ExpenseView, TripContext } from '@/lib/types';
import { BalanceBadge } from './balance-badge';
import { StatTile } from './stat-tile';
import { useTripUi } from './trip-shell';

type View = 'overview' | 'details';

/**
 * Switches the category breakdown between the whole trip and just my share.
 * Both options stay on screen so the current one is never ambiguous.
 */
function CategoryScopeToggle({
  mineOnly,
  onChange,
}: {
  mineOnly: boolean;
  onChange: (mineOnly: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="ขอบเขตของยอดตามหมวดหมู่"
      className="inline-flex rounded-lg border border-line bg-surface p-0.5"
    >
      {(
        [
          [false, 'ทั้งทริป'],
          [true, 'ของฉัน'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={label}
          type="button"
          aria-pressed={mineOnly === value}
          onClick={() => onChange(value)}
          className={`min-h-8 rounded-md px-2.5 text-xs font-medium transition-colors ${
            mineOnly === value ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function TripDashboard({
  context,
  stats,
  myCategoryTotals,
  recentExpenses,
}: {
  context: TripContext;
  stats: TripStats;
  myCategoryTotals: CategoryTotal[];
  recentExpenses: ExpenseView[];
}) {
  const { openExpense } = useTripUi();
  const [view, setView] = useState<View>('overview');
  const [categoryMineOnly, setCategoryMineOnly] = useState(false);
  const categories = categoryMineOnly ? myCategoryTotals : stats.byCategory;
  const { trip, members, allMembers } = context;
  const currency = trip.baseCurrency;

  const memberById = new Map(allMembers.map((member) => [member.id, member]));
  const myBalance = stats.balances.find((balance) => balance.memberId === context.currentMember.id);

  if (stats.expenseCount === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<ReceiptText aria-hidden className="size-8" />}
          title="ยังไม่มีค่าใช้จ่ายในทริปนี้"
          description="กดปุ่ม “เพิ่มค่าใช้จ่าย” เพื่อบันทึกรายการแรก ใช้เวลาไม่ถึงสิบวินาที"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="มุมมองแดชบอร์ด" className="inline-flex rounded-lg border border-line bg-surface p-1">
        {(
          [
            ['overview', 'ภาพรวม'],
            ['details', 'รายละเอียด'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`min-h-9 rounded-md px-4 text-sm font-medium transition-colors ${
              view === key ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="ค่าใช้จ่ายรวมทั้งทริป"
          value={formatMoney(stats.totalMinor, currency)}
          hint={
            myBalance ? `ของฉัน ${formatMoney(myBalance.spentMinor, currency)}` : undefined
          }
          icon={<Wallet aria-hidden className="size-3.5" />}
        />
        <StatTile
          label="ไม่รวมค่าใช้จ่ายก่อนเดินทาง"
          value={formatMoney(stats.totalExcludingPreTripMinor, currency)}
          hint={
            stats.preTripMinor > 0
              ? `ก่อนเดินทาง ${formatMoney(stats.preTripMinor, currency)}`
              : 'ไม่มีรายการก่อนเดินทาง'
          }
          icon={<CalendarRange aria-hidden className="size-3.5" />}
        />
        <StatTile
          label="ยอดที่ยังไม่เคลียร์"
          value={formatMoney(stats.outstandingMinor, currency)}
          tone={stats.outstandingMinor === 0 ? 'positive' : 'brand'}
          hint={
            stats.outstandingMinor === 0 ? 'ทุกคนเคลียร์กันหมดแล้ว' : 'ดูวิธีโอนได้ที่แท็บ “ยอดโอน”'
          }
          icon={<Scale aria-hidden className="size-3.5" />}
        />
        <StatTile
          label="สถานะของฉัน"
          value={
            myBalance ? (
              <BalanceBadge netMinor={myBalance.netMinor} currency={currency} />
            ) : (
              '—'
            )
          }
          hint={
            myBalance
              ? `จ่ายไป ${formatMoney(myBalance.paidMinor, currency)} · ส่วนของฉัน ${formatMoney(myBalance.spentMinor, currency)}`
              : undefined
          }
          icon={<PiggyBank aria-hidden className="size-3.5" />}
        />
      </div>

      {view === 'overview' ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader title="ยอดของแต่ละคน" description="จ่ายไปเท่าไร และค้างอยู่เท่าไร" />
            <CardBody className="py-0">
              <ul className="divide-y divide-line">
                {stats.balances.map((balance) => {
                  const member = memberById.get(balance.memberId);
                  if (!member) return null;
                  return (
                    <li key={balance.memberId} className="flex items-center gap-3 py-3">
                      <MemberAvatar
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                        dimmed={member.removedAt !== null}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {member.displayName}
                          {member.isMe ? <span className="text-muted"> (ฉัน)</span> : null}
                        </p>
                        <p className="tabular text-xs text-muted">
                          จ่าย {formatMoney(balance.paidMinor, currency)} · ใช้{' '}
                          {formatMoney(balance.spentMinor, currency)}
                        </p>
                      </div>
                      <BalanceBadge netMinor={balance.netMinor} currency={currency} size="sm" />
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="ค่าใช้จ่ายตามหมวดหมู่"
              action={
                <CategoryScopeToggle mineOnly={categoryMineOnly} onChange={setCategoryMineOnly} />
              }
            />
            <CardBody className="py-3">
              {categories.length === 0 ? (
                <p className="py-2 text-sm text-muted">ยังไม่มีค่าใช้จ่ายส่วนของคุณ</p>
              ) : null}
              <ul className="space-y-2.5">
                {categories.slice(0, 5).map((item) => (
                  <li key={item.category}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-ink">{item.label}</span>
                      <span className="tabular shrink-0 font-medium text-ink">
                        {formatMoney(item.amountMinor, currency)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                      <div
                        className={`h-full rounded-full ${item.barClass}`}
                        style={{ width: `${Math.max(item.share * 100, 2)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {categories.length > 5 ? (
                <button
                  type="button"
                  onClick={() => setView('details')}
                  className="mt-3 text-sm font-medium text-brand-strong underline underline-offset-2"
                >
                  ดูทุกหมวดหมู่
                </button>
              ) : null}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="รายการล่าสุด"
              action={
                <Link
                  href={`/trips/${trip.id}/expenses`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"
                >
                  ดูทั้งหมด
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              }
            />
            <CardBody className="py-0">
              <ul className="divide-y divide-line">
                {recentExpenses.map((expense) => {
                  const payer = expense.payerMemberId ? memberById.get(expense.payerMemberId) : null;
                  return (
                    <li key={expense.id}>
                      <button
                        type="button"
                        onClick={() => openExpense(expense)}
                        className="flex w-full items-center gap-3 py-3 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{expense.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <CategoryChip category={expense.category} />
                            <span>{formatDateWithWeekday(expense.expenseDate)}</span>
                            {payer ? <span>จ่ายโดย {payer.displayName}</span> : <span>ทุกคนจ่ายเอง</span>}
                          </div>
                        </div>
                        <span className="tabular shrink-0 text-sm font-semibold text-ink">
                          {formatMoney(expense.baseAmountMinor, currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="ทุกหมวดหมู่"
              action={
                <CategoryScopeToggle mineOnly={categoryMineOnly} onChange={setCategoryMineOnly} />
              }
            />
            <CardBody className="py-3">
              {categories.length === 0 ? (
                <p className="py-2 text-sm text-muted">ยังไม่มีค่าใช้จ่ายส่วนของคุณ</p>
              ) : null}
              <ul className="space-y-2.5">
                {categories.map((item) => (
                  <li key={item.category} className="flex items-center justify-between gap-2 text-sm">
                    <CategoryChip category={item.category} />
                    <span className="tabular font-medium text-ink">
                      {formatMoney(item.amountMinor, currency)}
                      <span className="ml-1.5 text-xs font-normal text-muted">
                        {Math.round(item.share * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="ค่าใช้จ่ายรายวัน" />
            <CardBody className="py-3">
              <ul className="space-y-2.5">
                {stats.byDay.map((day) => (
                  <li key={day.date} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-ink">{formatDateWithWeekday(day.date)}</span>
                      <span className="ml-1.5 text-xs text-muted">
                        {tripDayLabel(day.tripDay)} · {day.count} รายการ
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-medium text-ink">
                      {formatMoney(day.amountMinor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="สรุปต่อคน"
              description="ยอดที่จ่ายจริง ยอดที่เป็นส่วนของตัวเอง และยอดคงเหลือหลังหักรายการที่โอนแล้ว"
            />
            <CardBody className="overflow-x-auto px-0 py-0">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="px-4 py-2 font-medium sm:px-5">สมาชิก</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">จ่ายไป</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">ส่วนของตัวเอง</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">โอนแล้ว</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">คงเหลือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stats.balances.map((balance) => {
                    const member = memberById.get(balance.memberId);
                    if (!member) return null;
                    return (
                      <tr key={balance.memberId}>
                        <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink sm:px-5">
                          {member.displayName}
                        </th>
                        <td className="tabular px-4 py-2.5 text-right text-ink-soft">
                          {formatMoney(balance.paidMinor, currency)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-ink-soft">
                          {formatMoney(balance.spentMinor, currency)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-ink-soft">
                          {formatMoney(balance.transfersOutMinor - balance.transfersInMinor, currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right sm:px-5">
                          <BalanceBadge netMinor={balance.netMinor} currency={currency} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {stats.excludedFromSettlementMinor > 0 ? (
            <Card className="lg:col-span-2">
              <CardBody>
                <p className="text-sm text-ink-soft">
                  มีค่าใช้จ่าย{' '}
                  <span className="tabular font-semibold text-ink">
                    {formatMoney(stats.excludedFromSettlementMinor, currency)}
                  </span>{' '}
                  ที่ถูกตั้งค่าไม่ให้นำไปคำนวณยอดโอน ยอดนี้ยังนับรวมในยอดรวมทริปและยอดของแต่ละคนตามปกติ
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}

      <p className="text-xs text-muted">
        ทุกยอดแสดงเป็นสกุลเงินหลักของทริป ({currency}) · สมาชิกทั้งหมด {members.length} คน
      </p>
    </div>
  );
}
