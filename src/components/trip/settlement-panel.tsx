'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCheck, CheckCircle2, Clock, History, RefreshCw, Undo2 } from 'lucide-react';
import { CategoryChip } from '@/components/ui/category-icon';
import { formatDateWithWeekday } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Checkbox } from '@/components/ui/field';
import { MemberAvatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';
import { formatMoney, fromMinorUnits } from '@/lib/money';
import {
  cancelSettlementAction,
  confirmSettlementAction,
  recordSettlementAction,
  settleAllAction,
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
  /** Id of the live payment record for this row, paid or merely claimed. */
  settlementId: string | null;
  /** null = nothing recorded, 'pending' = claimed but not yet confirmed. */
  settlementStatus: 'pending' | 'paid' | null;
  /** Whether the viewer is the one entitled to confirm receipt. */
  canConfirm: boolean;
  receiverName: string;
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

  const [onlyUnpaid, setOnlyUnpaid] = useState(true);
  const [settleAllOpen, setSettleAllOpen] = useState(false);

  const currency = context.trip.baseCurrency;
  const memberById = new Map(context.allMembers.map((member) => [member.id, member]));
  const unpaid = items.filter((item) => item.settlementStatus !== 'paid');
  const paidCount = items.length - unpaid.length;
  const unpaidCount = unpaid.length;
  const unpaidTotalMinor = unpaid.reduce((total, item) => total + item.amountMinor, 0);
  const visibleItems = onlyUnpaid ? unpaid : items;
  // Claims still waiting on a confirmation belong in the list above, not here.
  const history = settlements.filter((settlement) => settlement.status !== 'pending');
  const name = (memberId: string) => memberById.get(memberId)?.displayName ?? 'สมาชิกที่ออกไปแล้ว';

  function itemKey(item: SettlementItem) {
    return `${item.expenseId}:${item.fromMemberId}:${item.toMemberId}`;
  }

  function runOnItem(
    item: SettlementItem,
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
  ) {
    setBusyKey(itemKey(item));
    startTransition(async () => {
      const result = await action();
      setBusyKey(null);
      showToast({
        message: result.ok ? successMessage : (result.error ?? 'เกิดข้อผิดพลาด'),
        tone: result.ok ? 'success' : 'error',
      });
    });
  }

  /** Records the transfer: outright when the viewer is the receiver, otherwise
      as a claim the receiver still has to confirm. */
  function markTransferred(item: SettlementItem) {
    runOnItem(
      item,
      () =>
        recordSettlementAction({
          tripId: context.trip.id,
          expenseId: item.expenseId,
          fromMemberId: item.fromMemberId,
          toMemberId: item.toMemberId,
          amount: fromMinorUnits(item.amountMinor, currency),
          note: item.description,
        }),
      item.canConfirm
        ? `บันทึกแล้ว: ${name(item.fromMemberId)} โอนให้ ${name(item.toMemberId)}`
        : `แจ้งแล้ว รอ ${item.receiverName} ยืนยันว่าได้รับ`,
    );
  }

  function confirmReceipt(item: SettlementItem) {
    if (!item.settlementId) return;
    const settlementId = item.settlementId;
    runOnItem(
      item,
      () => confirmSettlementAction(context.trip.id, settlementId),
      'ยืนยันว่าได้รับเงินแล้ว',
    );
  }

  function undoItem(item: SettlementItem) {
    if (!item.settlementId) return;
    const settlementId = item.settlementId;
    runOnItem(
      item,
      () => cancelSettlementAction(context.trip.id, settlementId),
      item.settlementStatus === 'pending' ? 'ยกเลิกการแจ้งโอนแล้ว' : 'ยกเลิกการโอนรายการนี้แล้ว',
    );
  }

  function settleEverything() {
    setBusyKey('__all__');
    startTransition(async () => {
      const result = await settleAllAction(context.trip.id);
      setBusyKey(null);
      setSettleAllOpen(false);
      showToast({
        message: result.ok ? `บันทึกว่าโอนแล้ว ${result.data.settled} รายการ` : result.error,
        tone: result.ok ? 'success' : 'error',
      });
    });
  }

  function removeSettlement(settlement: SettlementView) {
    setBusyKey(settlement.id);
    startTransition(async () => {
      const result = await cancelSettlementAction(context.trip.id, settlement.id);
      setBusyKey(null);
      showToast({
        message: result.ok ? 'ลบรายการโอนแล้ว' : result.error,
        tone: result.ok ? 'success' : 'error',
      });
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
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setSettleAllOpen(true)}
                  disabled={unpaidCount === 0 || pending}
                >
                  <CheckCheck aria-hidden className="size-4" />
                  โอนหมดแล้ว
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => router.refresh()}>
                  <RefreshCw aria-hidden className="size-4" />
                  คำนวณใหม่
                </Button>
              </div>
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
                <div className="space-y-2 border-b border-line py-2.5">
                  <p className="text-sm text-muted">
                    ยังไม่โอน{' '}
                    <span className="tabular font-semibold text-ink">{unpaidCount} รายการ</span>{' '}
                    · รวม{' '}
                    <span className="tabular font-semibold text-ink">
                      {formatMoney(unpaidTotalMinor, currency)}
                    </span>
                  </p>
                  <Checkbox
                    checked={onlyUnpaid}
                    onChange={(event) => setOnlyUnpaid(event.target.checked)}
                    label="แสดงเฉพาะรายการที่ยังไม่โอน"
                    hint={paidCount > 0 ? `ซ่อนอยู่ ${paidCount} รายการที่โอนแล้ว` : undefined}
                  />
                </div>

                <ul className="divide-y divide-line">
                  {visibleItems.map((item) => {
                    const key = itemKey(item);
                    const paid = item.settlementStatus === 'paid';
                    const claimed = item.settlementStatus === 'pending';
                    // The label describes the viewer's own side of the row;
                    // whether pressing it settles or merely claims is decided
                    // separately by item.canConfirm.
                    const viewerIsReceiver = item.toMemberId === context.currentMember.id;
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
                          {claimed ? (
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-accent">
                              <span className="inline-flex items-center gap-1">
                                <Clock aria-hidden className="size-3.5" />
                                แจ้งโอนแล้ว · รอ {item.receiverName} ยืนยันว่าได้รับ
                              </span>
                              <button
                                type="button"
                                onClick={() => undoItem(item)}
                                className="text-muted underline underline-offset-2"
                              >
                                ยกเลิกการแจ้ง
                              </button>
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span
                            className={`tabular text-base font-semibold ${
                              paid ? 'text-muted line-through' : 'text-ink'
                            }`}
                          >
                            {formatMoney(item.amountMinor, currency)}
                          </span>
                          {pending && busyKey === key ? (
                            <Button type="button" variant="secondary" size="sm" disabled>
                              กำลังบันทึก…
                            </Button>
                          ) : paid ? (
                            <Button type="button" variant="secondary" size="sm" onClick={() => undoItem(item)}>
                              เลิกทำ
                            </Button>
                          ) : claimed ? (
                            item.canConfirm ? (
                              <Button type="button" size="sm" onClick={() => confirmReceipt(item)}>
                                ยืนยันว่าได้รับ
                              </Button>
                            ) : null
                          ) : (
                            <Button type="button" size="sm" onClick={() => markTransferred(item)}>
                              {viewerIsReceiver ? 'ได้รับแล้ว' : 'โอนแล้ว'}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {visibleItems.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted">
                    โอนครบทุกรายการแล้ว
                  </p>
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

      <ConfirmDialog
        open={settleAllOpen}
        title="บันทึกว่าโอนครบทุกรายการ?"
        description={
          <>
            รายการที่ยังไม่โอนทั้งหมด{' '}
            <span className="font-medium text-ink">{unpaidCount} รายการ</span> รวม{' '}
            <span className="tabular font-medium text-ink">
              {formatMoney(unpaidTotalMinor, currency)}
            </span>{' '}
            จะถูกบันทึก โดยรายการที่คุณเป็นผู้รับเงินจะถูกยืนยันทันที
            ส่วนรายการของคนอื่นจะเป็นการแจ้งโอน รอเจ้าของรายการยืนยันอีกที
          </>
        }
        confirmLabel="บันทึกทั้งหมด"
        tone="primary"
        onConfirm={settleEverything}
        onClose={() => setSettleAllOpen(false)}
      />

      <Card>
        <CardHeader
          title="ประวัติการโอน"
          icon={<History aria-hidden className="size-4" />}
          description="เฉพาะรายการที่ยืนยันแล้ว กดเลิกทำเพื่อลบออก"
        />
        <CardBody className={history.length === 0 ? '' : 'py-0'}>
          {history.length === 0 ? (
            <p className="py-2 text-sm text-muted">ยังไม่มีการบันทึกการโอน</p>
          ) : (
            <ul className="divide-y divide-line">
              {history.map((settlement) => (
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
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => removeSettlement(settlement)}
                    disabled={pending && busyKey === settlement.id}
                  >
                    <Undo2 aria-hidden className="size-4" />
                    เลิกทำ
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
