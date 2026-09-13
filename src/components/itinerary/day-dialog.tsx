'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  type TransportMode,
} from '@/lib/itinerary/schedule';
import type { ItineraryDayView } from '@/lib/itinerary/types';
import { TimeField } from './time-field';

export const TIME_ZONES = [
  { value: 'Asia/Bangkok', label: 'ไทย (Asia/Bangkok)' },
  { value: 'Asia/Tokyo', label: 'ญี่ปุ่น (Asia/Tokyo)' },
  { value: 'Asia/Seoul', label: 'เกาหลีใต้ (Asia/Seoul)' },
  { value: 'Asia/Taipei', label: 'ไต้หวัน (Asia/Taipei)' },
  { value: 'Asia/Singapore', label: 'สิงคโปร์ (Asia/Singapore)' },
  { value: 'Asia/Hong_Kong', label: 'ฮ่องกง (Asia/Hong_Kong)' },
  { value: 'UTC', label: 'UTC' },
];

export function timeZoneLabel(zone: string): string {
  return TIME_ZONES.find((candidate) => candidate.value === zone)?.label ?? zone;
}

export interface DayDraft {
  startLocalTime: string;
  timeZone: string;
  defaultTransportMode: TransportMode;
}

/**
 * Day settings, edited as a draft.
 *
 * Nothing is written while the fields are being changed: "ยืนยัน" sends the
 * whole draft, "ยกเลิก" throws it away.
 */
export function DayDialog({
  open,
  day,
  title,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  day: ItineraryDayView;
  title: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (draft: DayDraft) => void;
}) {
  const [draft, setDraft] = useState<DayDraft>(() => ({
    startLocalTime: day.startLocalTime.slice(0, 5),
    timeZone: day.timeZone,
    defaultTransportMode: day.defaultTransportMode,
  }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ตั้งค่าวันนี้"
      description={title}
      footer={
        <div className="space-y-2">
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-sm leading-6 text-ink"
            >
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={() => onConfirm(draft)} disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'ยืนยัน'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="เริ่มวันเวลา">
          <TimeField
            value={draft.startLocalTime}
            disabled={busy}
            hourLabel="ชั่วโมงที่เริ่มวัน"
            minuteLabel="นาทีที่เริ่มวัน"
            onChange={(next) =>
              setDraft((current) => ({ ...current, startLocalTime: next ?? '00:00' }))
            }
          />
        </Field>

        <Field label="เขตเวลา">
          <Select
            value={draft.timeZone}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({ ...current, timeZone: event.target.value }))
            }
          >
            {TIME_ZONES.some((zone) => zone.value === draft.timeZone) ? null : (
              <option value={draft.timeZone}>{draft.timeZone}</option>
            )}
            {TIME_ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="การเดินทางเริ่มต้น" hint="ใช้กับช่วงเดินทางที่ยังไม่ได้เลือกเอง">
          <Select
            value={draft.defaultTransportMode}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                defaultTransportMode: event.target.value as TransportMode,
              }))
            }
          >
            {TRANSPORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {TRANSPORT_MODE_LABELS[mode]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}
