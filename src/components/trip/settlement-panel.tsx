'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, History, RefreshCw, Undo2 } from 'lucide-react';
import { CategoryChip } from '@/components/ui/category-icon';
import { formatDateWithWeekday } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { MemberAvatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';
import { formatMoney, fromMinorUnits } from '@/lib/money';
import {
  cancelSettlementAction,
  recordSettlementAction,
  restoreSettlementAction,
} from '@/lib/actions/settlements';
import type { MemberBalance } from '@/lib/settlement';
import type { SettlementView, TripContext } from '@/lib/types';
import { BalanceBadge } from './balance-badge';

export interface SettlementItem {
  expenseId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  description: string;
  category: string;
  expenseDate: string;
  /** Id of the payment that cleared this row, when it has been settled. */
  settlementId: string | null;
}

export function SettlementPanel({
  context,
  balances,
  items,
  settlements,
  zeroSum,
}: {
  context: TripContext;
  balances: MemberBalance[];
  items: SettlementItem[];
  settlements: SettlementView[];
  zeroSum: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [showPaid, setShowPaid] = useState(false);

  const currency = context.trip.baseCurrency;
  const memberById = new Map(context.allMembers.map((member) => [member.id, member]));
  const unpaid = items.filter((item) => item.settlementId === null);
  const paidCount = items.length - unpaid.length;
  const unpaidCount = unpaid.length;
  const unpaidTotalMinor = unpaid.reduce((total, item) => total + item.amountMinor, 0);
  const visibleItems = showPaid ? items : unpaid;
  const name = (memberId: string) => memberById.get(memberId)?.displayName ?? 'สมาชิกที่ออกไปแล้ว';

  function itemKey(item: SettlementItem) {
    return `${item.expenseId}:${item.fromMemberId}:${item.toMemberId}`;
  }

  function toggleItem(item: SettlementItem) {
    setBusyKey(itemKey(item));
    startTransition(async () => {
      const result = item.settlementId
        ? await cancelSettlementAction(context.trip.id, item.settlementId)
        : await recordSettlementAction({
            tripId: context.trip.id,
            expenseId: item.expenseId,
            fromMemberId: item.fromMemberId,
            toMemberId: item.toMemberId,
            amount: fromMinorUnits(item.amountMinor, currency),
            note: item.description,
          });
      setBusyKey(null);
      showToast({
        message: result.ok
          ? item.settlementId
            ? 'ยกเลิกการโอนรายการนี้แล้ว'
            : `บันทึกแล้ว: ${name(item.fromMemberId)} โอนให้ ${name(item.toMemberId)}`
          : result.error,
        tone: result.ok ? 'success' : 'error',
      });
      if (result.ok) router.refresh();
    });
  }

  function toggleSettlement(settlement: SettlementView) {
    setBusyKey(settlement.id);
    startTransition(async () => {
      const result =
        settlement.status === 'paid'
          ? await cancelSettlementAction(context.trip.id, settlement.id)
          : await restoreSettlementAction(context.trip.id, settlement.id);
      setBusyKey(null);
      showToast({
        message: result.ok
          ? settlement.status === 'paid'
            ? 'ยกเลิกรายการโอนแล้ว'
            : 'กู้คืนรายการโอนแล้ว'
          : result.error,
        tone: result.ok ? 'success' : 'error',
      });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="รายการที่ต้องโอน"
            description="แยกตามค่าใช้จ่ายแต่ละรายการ กดยืนยันทีละรายการได้"
            action={
              <Button type="button" variant="ghost" size="sm" onClick={() => router.refresh()}>
                <RefreshCw aria-hidden className="size-4" />
                คำนวณใหม่
              </Button>
            }
          />
          <CardBody className={items.length === 0 ? '' : 'py-0'}>
            {items.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 aria-hidden className="size-8" />}
                title="ไม่มีรายการที่ต้องโอน"
                description="ทุกรายการในทริปนี้ไม่ได้ทำให้ใครเป็นหนี้ใคร หรือเคลียร์กันหมดแล้ว"
              />
            ) : (
              <>
                {unpaidCount > 0 ? (
                  <p className="border-b border-line py-2.5 text-sm text-muted">
                    ยังไม่โอน{' '}
                    <span className="tabular font-semibold text-ink">{unpaidCount} รายการ</span>{' '}
                    · รวม{' '}
                    <span className="tabular font-semibold text-ink">
                      {formatMoney(unpaidTotalMinor, currency)}
                    </span>
                  </p>
                ) : null}

                <ul className="divide-y divide-line">
                  {visibleItems.map((item) => {
                    const key = itemKey(item);
                    const paid = item.settlementId !== null;
                    const from = memberById.get(item.fromMemberId);
                    const to = memberById.get(item.toMemberId);
                    return (
                      <li key={key} className="flex items-start gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <MemberAvatar name={name(item.fromMemberId)} avatarUrl={from?.avatarUrl} size="sm" />
                            <span className={`text-sm font-medium ${paid ? 'text-muted' : 'text-ink'}`}>
                              {name(item.fromMemberId)}
                            </span>
                            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
                            <MemberAvatar name={name(item.toMemberId)} avatarUrl={to?.avatarUrl} size="sm" />
                            <span className={`text-sm font-medium ${paid ? 'text-muted' : 'text-ink'}`}>
                              {name(item.toMemberId)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <CategoryChip category={item.category} />
                            <span className="truncate">{item.description}</span>
                            <span>{formatDateWithWeekday(item.expenseDate)}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span
                            className={`tabular text-base font-semibold ${
                              paid ? 'text-muted line-through' : 'text-ink'
                            }`}
                          >
                            {formatMoney(item.amountMinor, currency)}
                          </span>
                          <Button
                            type="button"
                            variant={paid ? 'secondary' : 'primary'}
                            size="sm"
                            onClick={() => toggleItem(item)}
                            disabled={pending && busyKey === key}
                          >
                            {pending && busyKey === key
                              ? 'กำลังบันทึก…'
                              : paid
                                ? 'เลิกทำ'
                                : 'โอนแล้ว'}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {paidCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPaid((current) => !current)}
                    className="w-full border-t border-line py-2.5 text-sm font-medium text-brand-strong"
                  >
                    {showPaid ? 'ซ่อนรายการที่โอนแล้ว' : `แสดงรายการที่โอนแล้ว (${paidCount})`}
                  </button>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="ยอดคงเหลือของแต่ละคน" />
          <CardBody className="py-0">
            <ul className="divide-y divide-line">
              {balances.map((balance) => {
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
                        จ่ายเข้ากองกลาง {formatMoney(balance.settlementPaidMinor, currency)} · ส่วนที่ต้องรับผิดชอบ{' '}
                        {formatMoney(balance.settlementOwedMinor, currency)}
                      </p>
                    </div>
                    <BalanceBadge netMinor={balance.netMinor} currency={currency} size="sm" />
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      {!zeroSum ? (
        <p role="alert" className="rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative">
          ยอดคงเหลือรวมไม่เท่ากับศูนย์ กรุณาตรวจสอบรายการค่าใช้จ่ายอีกครั้ง
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="ประวัติการโอน"
          icon={<History aria-hidden className="size-4" />}
          description="รายการที่ถูกยกเลิกจะไม่ถูกนำไปคำนวณ แต่ยังเก็บไว้เป็นประวัติ"
        />
        <CardBody className={settlements.length === 0 ? '' : 'py-0'}>
          {settlements.length === 0 ? (
            <p className="py-2 text-sm text-muted">ยังไม่มีการบันทึกการโอน</p>
          ) : (
            <ul className="divide-y divide-line">
              {settlements.map((settlement) => (
                <li key={settlement.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      <span className="font-medium">{name(settlement.fromMemberId)}</span> โอนให้{' '}
                      <span className="font-medium">{name(settlement.toMemberId)}</span>{' '}
                      <span className="tabular font-semibold">
                        {formatMoney(settlement.amountMinor, currency)}
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(settlement.paidAt ?? settlement.createdAt)}
                      {settlement.status === 'cancelled' ? ' · ยกเลิกแล้ว' : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={settlement.status === 'paid' ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => toggleSettlement(settlement)}
                    disabled={pending && busyKey === settlement.id}
                  >
                    <Undo2 aria-hidden className="size-4" />
                    {settlement.status === 'paid' ? 'เลิกทำ' : 'กู้คืน'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
