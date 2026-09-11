'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, DoorOpen, Pencil, Trash2, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MemberAvatar } from '@/components/ui/avatar';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { COMMON_CURRENCIES } from '@/lib/currencies';
import {
  leaveTripAction,
  memberUsageAction,
  removeMemberAction,
  renameMemberAction,
} from '@/lib/actions/members';
import { deleteTripAction, updateTripAction, upsertTripCurrencyAction } from '@/lib/actions/trips';
import type { TripContext, TripMemberView } from '@/lib/types';
import { ShareLinkButton } from './share-link';
import { useTripUi } from './trip-shell';

export function MembersPanel({ context }: { context: TripContext }) {
  const router = useRouter();
  const { openShare } = useTripUi();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  const [renaming, setRenaming] = useState<TripMemberView | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removing, setRemoving] = useState<TripMemberView | null>(null);
  const [removalUsage, setRemovalUsage] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const { trip, members, isOwner, currentMember } = context;

  function startRename(member: TripMemberView) {
    setRenaming(member);
    setRenameValue(member.displayName);
  }

  function submitRename() {
    if (!renaming) return;
    const member = renaming;
    startTransition(async () => {
      const result = await renameMemberAction(trip.id, {
        memberId: member.id,
        displayName: renameValue,
      });
      if (!result.ok) {
        showToast({ message: result.error, tone: 'error' });
        return;
      }
      setRenaming(null);
      showToast({ message: 'เปลี่ยนชื่อเรียบร้อย', tone: 'success' });
      router.refresh();
    });
  }

  function startRemove(member: TripMemberView) {
    setRemoving(member);
    setRemovalUsage(null);
    startTransition(async () => {
      const usage = await memberUsageAction(trip.id, member.id);
      if (!usage.ok) return;
      const { expenseCount, splitCount, settlementCount } = usage.data;
      if (expenseCount + splitCount + settlementCount === 0) {
        setRemovalUsage('สมาชิกคนนี้ยังไม่มีรายการค่าใช้จ่ายในทริป');
      } else {
        setRemovalUsage(
          `สมาชิกคนนี้ยังผูกกับข้อมูลการเงินอยู่ (จ่าย ${expenseCount} รายการ, อยู่ในการหาร ${splitCount} รายการ, การโอน ${settlementCount} รายการ) ระบบจะเก็บประวัติทั้งหมดไว้ และเพียงแค่นำออกจากรายชื่อสมาชิกที่ใช้งานอยู่`,
        );
      }
    });
  }

  function confirmRemove() {
    if (!removing) return;
    const member = removing;
    startTransition(async () => {
      const result = await removeMemberAction(trip.id, member.id);
      setRemoving(null);
      showToast({
        message: result.ok ? `นำ ${member.displayName} ออกจากทริปแล้ว` : result.error,
        tone: result.ok ? 'success' : 'error',
      });
      if (result.ok) router.refresh();
    });
  }

  function confirmLeave() {
    startTransition(async () => {
      const result = await leaveTripAction(trip.id);
      setLeaveOpen(false);
      if (!result.ok) {
        showToast({ message: result.error, tone: 'error' });
        return;
      }
      router.replace('/trips');
    });
  }

  function confirmDeleteTrip() {
    startTransition(async () => {
      const result = await deleteTripAction(trip.id);
      setDeleteOpen(false);
      if (!result.ok) {
        showToast({ message: result.error, tone: 'error' });
        return;
      }
      router.replace('/trips');
    });
  }

  function submitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateTripAction({
        tripId: trip.id,
        name: String(form.get('name') ?? ''),
        destination: String(form.get('destination') ?? ''),
        startDate: String(form.get('startDate') ?? ''),
        endDate: String(form.get('endDate') ?? ''),
      });
      if (!result.ok) {
        showToast({ message: result.error, tone: 'error' });
        return;
      }
      setSettingsOpen(false);
      showToast({ message: 'บันทึกข้อมูลทริปแล้ว', tone: 'success' });
      router.refresh();
    });
  }

  function submitCurrency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await upsertTripCurrencyAction({
        tripId: trip.id,
        currencyCode: String(form.get('currencyCode') ?? ''),
        rate: String(form.get('rate') ?? ''),
      });
      if (!result.ok) {
        showToast({ message: result.error, tone: 'error' });
        return;
      }
      setCurrencyOpen(false);
      showToast({
        message: 'บันทึกอัตราแลกเปลี่ยนแล้ว รายการเดิมยังใช้อัตราที่บันทึกไว้ตอนนั้น',
        tone: 'success',
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="สมาชิกในทริป"
          description={`${members.length} คน · แชร์ลิงก์เพื่อชวนเพิ่ม`}
          action={<ShareLinkButton onClick={openShare} compact />}
        />
        <CardBody className="py-0">
          <ul className="divide-y divide-line">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} size="lg" />
                <div className="min-w-24 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {member.displayName}
                    {member.isMe ? <span className="text-muted"> (ฉัน)</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {member.role === 'owner' ? 'เจ้าของทริป' : 'สมาชิก'}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 gap-1">
                  {member.isMe || isOwner ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => startRename(member)}>
                      <Pencil aria-hidden className="size-4" />
                      <span className="sr-only sm:not-sr-only">เปลี่ยนชื่อ</span>
                    </Button>
                  ) : null}
                  {isOwner && !member.isMe && member.role !== 'owner' ? (
                    <Button type="button" variant="danger" size="sm" onClick={() => startRemove(member)}>
                      <UserMinus aria-hidden className="size-4" />
                      <span className="sr-only">นำออกจากทริป</span>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {context.allMembers.some((member) => member.removedAt !== null) ? (
            <p className="border-t border-line py-2.5 text-xs text-muted">
              อดีตสมาชิก:{' '}
              {context.allMembers
                .filter((member) => member.removedAt !== null)
                .map((member) => member.displayName)
                .join(', ')}{' '}
              — ประวัติค่าใช้จ่ายของพวกเขายังถูกเก็บไว้
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="สกุลเงินของทริป"
          description={`สกุลเงินหลัก: ${trip.baseCurrency}`}
          icon={<Coins aria-hidden className="size-4" />}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => setCurrencyOpen(true)}>
              เพิ่ม / แก้ไขอัตรา
            </Button>
          }
        />
        <CardBody className="py-0">
          <ul className="divide-y divide-line">
            {context.currencies.map((currency) => (
              <li key={currency.code} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="font-medium text-ink">{currency.code}</span>
                <span className="tabular text-ink-soft">
                  {currency.code === trip.baseCurrency
                    ? 'สกุลเงินหลัก'
                    : `1 ${currency.code} = ${currency.rate} ${trip.baseCurrency}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line py-2.5 text-xs leading-5 text-muted">
            อัตรานี้ใช้เป็นค่าตั้งต้นตอนเพิ่มค่าใช้จ่ายเท่านั้น รายการที่บันทึกไปแล้วจะยังใช้อัตราเดิมที่บันทึกไว้เสมอ
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="การตั้งค่าทริป" />
        <CardBody className="space-y-3">
          {isOwner ? (
            <Button type="button" variant="secondary" onClick={() => setSettingsOpen(true)}>
              <Pencil aria-hidden className="size-4" />
              แก้ไขข้อมูลทริป
            </Button>
          ) : (
            <p className="text-sm text-muted">เฉพาะเจ้าของทริปเท่านั้นที่แก้ไขข้อมูลทริปได้</p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {isOwner ? (
              <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden className="size-4" />
                ลบทริปนี้
              </Button>
            ) : (
              <Button type="button" variant="danger" onClick={() => setLeaveOpen(true)}>
                <DoorOpen aria-hidden className="size-4" />
                ออกจากทริป
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="เปลี่ยนชื่อที่แสดง"
        description="ชื่อนี้จะแสดงในรายการค่าใช้จ่ายของทริปนี้เท่านั้น"
      >
        <Field label="ชื่อที่แสดง" htmlFor="rename">
          <TextInput
            id="rename"
            data-autofocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={60}
          />
        </Field>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => setRenaming(null)} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={submitRename} disabled={pending}>
            บันทึก
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="แก้ไขข้อมูลทริป"
      >
        <form onSubmit={submitSettings} className="space-y-4">
          <Field label="ชื่อทริป" htmlFor="trip-name" required>
            <TextInput id="trip-name" name="name" data-autofocus defaultValue={trip.name} maxLength={120} required />
          </Field>
          <Field label="จุดหมาย" htmlFor="trip-destination">
            <TextInput id="trip-destination" name="destination" defaultValue={trip.destination} maxLength={160} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="วันเริ่มต้น" htmlFor="trip-start">
              <TextInput id="trip-start" name="startDate" type="date" defaultValue={trip.startDate ?? ''} />
            </Field>
            <Field label="วันสิ้นสุด" htmlFor="trip-end">
              <TextInput id="trip-end" name="endDate" type="date" defaultValue={trip.endDate ?? ''} />
            </Field>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              บันทึก
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        title="เพิ่มหรือแก้ไขอัตราแลกเปลี่ยน"
        description="ใช้เป็นค่าตั้งต้นของรายการใหม่เท่านั้น"
      >
        <form onSubmit={submitCurrency} className="space-y-4">
          <Field label="สกุลเงิน" htmlFor="currency-code" required>
            <Select id="currency-code" name="currencyCode" data-autofocus required>
              {COMMON_CURRENCIES.filter((currency) => currency.code !== trip.baseCurrency).map(
                (currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field
            label="อัตราแลกเปลี่ยน"
            htmlFor="currency-rate"
            hint={`เทียบกับสกุลเงินหลัก (${trip.baseCurrency})`}
            required
          >
            <TextInput id="currency-rate" name="rate" inputMode="decimal" placeholder="เช่น 26" required />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setCurrencyOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              บันทึก
            </Button>
          </div>
        </form>
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title={`นำ ${removing?.displayName ?? ''} ออกจากทริป?`}
        description={removalUsage ?? 'กำลังตรวจสอบข้อมูลที่เกี่ยวข้อง…'}
        confirmLabel="นำออกจากทริป"
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />

      <ConfirmDialog
        open={leaveOpen}
        title="ออกจากทริปนี้?"
        description="คุณจะไม่เห็นทริปนี้อีก แต่ค่าใช้จ่ายที่บันทึกไว้จะยังอยู่ให้สมาชิกคนอื่น เข้าร่วมใหม่ได้ด้วยลิงก์เชิญ"
        confirmLabel="ออกจากทริป"
        onConfirm={confirmLeave}
        onClose={() => setLeaveOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="ลบทริปนี้?"
        description={`ทริป “${trip.name}” จะหายไปจากรายการของทุกคน ข้อมูลจะถูกเก็บไว้ในระบบเพื่อความปลอดภัยของประวัติการเงิน แต่จะเข้าถึงไม่ได้อีก`}
        confirmLabel="ลบทริป"
        onConfirm={confirmDeleteTrip}
        onClose={() => setDeleteOpen(false)}
      />

      <p className="text-xs leading-5 text-muted">
        {currentMember.role === 'owner'
          ? 'คุณเป็นเจ้าของทริปนี้ จึงจัดการสมาชิกและลิงก์เชิญได้'
          : 'สมาชิกทุกคนเพิ่ม แก้ไข และลบค่าใช้จ่ายได้ แต่การจัดการสมาชิกเป็นสิทธิ์ของเจ้าของทริป'}{' '}
        ระบบจะไม่แสดงอีเมลของสมาชิกให้คนอื่นเห็น
      </p>
    </div>
  );
}
