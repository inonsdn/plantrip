'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, History, RefreshCw, Undo2 } from 'lucide-react';
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
import type { MemberBalance, Transfer } from '@/lib/settlement';
import type { SettlementView, TripContext } from '@/lib/types';
import { BalanceBadge } from './balance-badge';

export function SettlementPanel({
  context,
  balances,
  transfers,
  settlements,
  zeroSum,
}: {
  context: TripContext;
  balances: MemberBalance[];
  transfers: Transfer[];
  settlements: SettlementView[];
  zeroSum: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const currency = context.trip.baseCurrency;
  const memberById = new Map(context.allMembers.map((member) => [member.id, member]));
  const name = (memberId: string) => memberById.get(memberId)?.displayName ?? 'สมาชิกที่ออกไปแล้ว';

  function markPaid(transfer: Transfer) {
    const key = `${transfer.fromMemberId}:${transfer.toMemberId}`;
    setBusyKey(key);
    startTransition(async () => {
      const result = await recordSettlementAction({
        tripId: context.trip.id,
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        amount: fromMinorUnits(transfer.amountMinor, currency),
        note: null,
      });
      setBusyKey(null);
      showToast({
        message: result.ok
          ? `บันทึกแล้ว: ${name(transfer.fromMemberId)} โอนให้ ${name(transfer.toMemberId)}`
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
            title="ต้องโอนให้ใครบ้าง"
            description="ระบบจัดให้จำนวนครั้งการโอนน้อยที่สุด"
            action={
              <Button type="button" variant="ghost" size="sm" onClick={() => router.refresh()}>
                <RefreshCw aria-hidden className="size-4" />
                คำนวณใหม่
              </Button>
            }
          />
          <CardBody className={transfers.length === 0 ? '' : 'py-0'}>
            {transfers.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 aria-hidden className="size-8" />}
                title="เคลียร์กันหมดแล้ว"
                description="ไม่มียอดค้างระหว่างสมาชิกในทริปนี้"
              />
            ) : (
              <ul className="divide-y divide-line">
                {transfers.map((transfer) => {
                  const key = `${transfer.fromMemberId}:${transfer.toMemberId}`;
                  const from = memberById.get(transfer.fromMemberId);
                  const to = memberById.get(transfer.toMemberId);
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <MemberAvatar name={name(transfer.fromMemberId)} avatarUrl={from?.avatarUrl} size="sm" />
                        <span className="truncate text-sm font-medium text-ink">
                          {name(transfer.fromMemberId)}
                        </span>
                        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
                        <MemberAvatar name={name(transfer.toMemberId)} avatarUrl={to?.avatarUrl} size="sm" />
                        <span className="truncate text-sm font-medium text-ink">
                          {name(transfer.toMemberId)}
                        </span>
                      </div>
                      <span className="tabular shrink-0 text-base font-semibold text-ink">
                        {formatMoney(transfer.amountMinor, currency)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => markPaid(transfer)}
                        disabled={pending && busyKey === key}
                      >
                        {pending && busyKey === key ? 'กำลังบันทึก…' : 'โอนแล้ว'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
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
