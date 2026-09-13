'use client';

import { useState } from 'react';
import { MoveRight, ReceiptText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  formatClock,
  formatDuration,
  type ScheduleStopResult,
  type TransportMode,
} from '@/lib/itinerary/schedule';
import type { ItineraryStopView } from '@/lib/itinerary/types';
import { DurationField } from './duration-field';
import { TimeField } from './time-field';

export interface StopDraft {
  name: string;
  notes: string | null;
  visitDurationMinutes: number | null;
  notBeforeLocalTime: string | null;
  enabled: boolean;
}

export interface LegDraft {
  destinationStopId: string;
  destinationName: string;
  transportMode: TransportMode;
  manualDurationMinutes: number | null;
  notes: string | null;
}

/**
 * Everything about one place, and the journey from it to the next one.
 *
 * Both are drafts: nothing reaches the database until "ยืนยัน", and a failure
 * keeps the dialog open with the edits intact so they are not lost.
 */
export function StopDialog({
  open,
  stop,
  order,
  timing,
  leg,
  otherDays,
  busy,
  error,
  onClose,
  onConfirm,
  onDelete,
  onMoveToDay,
  onRecordExpense,
}: {
  open: boolean;
  stop: ItineraryStopView;
  order: number | null;
  timing: ScheduleStopResult | undefined;
  /** Absent for the last enabled place of the day: there is no onward journey. */
  leg: LegDraft | null;
  otherDays: Array<{ id: string; label: string }>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (stop: StopDraft, leg: LegDraft | null) => void;
  onDelete: () => void;
  onMoveToDay: (dayId: string) => void;
  onRecordExpense: (leg: LegDraft) => void;
}) {
  const [draft, setDraft] = useState<StopDraft>(() => ({
    name: stop.name,
    notes: stop.notes,
    visitDurationMinutes: stop.visitDurationMinutes,
    notBeforeLocalTime: stop.notBeforeLocalTime?.slice(0, 5) ?? null,
    enabled: stop.enabled,
  }));
  const [legDraft, setLegDraft] = useState<LegDraft | null>(leg);
  const [nameError, setNameError] = useState<string | null>(null);

  function confirm() {
    const name = draft.name.trim();
    if (!name) {
      setNameError('กรุณากรอกชื่อสถานที่');
      return;
    }
    setNameError(null);
    onConfirm(
      {
        ...draft,
        name,
        notes: draft.notes?.trim() ? draft.notes.trim() : null,
      },
      legDraft
        ? { ...legDraft, notes: legDraft.notes?.trim() ? legDraft.notes.trim() : null }
        : null,
    );
  }

  const arrivalText = !draft.enabled
    ? 'ไม่รวมในแผน'
    : timing && !timing.incomplete
      ? `ถึง ${formatClock(timing.arrivalMinutes)} · ออก ${formatClock(timing.departureMinutes)}`
      : 'ยังคำนวณไม่ได้';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={stop.name}
      description={order === null ? 'ไม่รวมในแผน' : `ลำดับที่ ${order}`}
      size="lg"
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
            <Button type="button" onClick={confirm} disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'ยืนยัน'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">ข้อมูลสถานที่</h3>

          <Field label="ชื่อสถานที่" error={nameError} required>
            <TextInput
              value={draft.name}
              disabled={busy}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
                if (nameError) setNameError(null);
              }}
            />
          </Field>

          <div className="rounded-lg border border-line bg-canvas px-3 py-2">
            <p className="text-xs text-muted">เวลาที่คำนวณได้</p>
            <p className="mt-0.5 text-sm font-medium text-ink">{arrivalText}</p>
          </div>

          <Field
            label="ไปถึงไม่ก่อนเวลา"
            hint="ถ้าไปถึงก่อนเวลานี้ แผนจะนับเป็นเวลารอ เว้นว่างได้ถ้าไม่มีเวลาตายตัว"
          >
            <TimeField
              value={draft.notBeforeLocalTime}
              disabled={busy}
              clearable
              hourLabel="ชั่วโมงที่จะไปถึง"
              minuteLabel="นาทีที่จะไปถึง"
              onChange={(next) => setDraft((current) => ({ ...current, notBeforeLocalTime: next }))}
            />
          </Field>

          <Field label="อยู่ที่นี่นานเท่าไร" hint="เลือกไม่ระบุได้ถ้ายังไม่รู้">
            <DurationField
              value={draft.visitDurationMinutes}
              disabled={busy}
              onChange={(next) =>
                setDraft((current) => ({ ...current, visitDurationMinutes: next }))
              }
            />
          </Field>

          <Field label="โน้ต">
            <TextArea
              value={draft.notes ?? ''}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </Field>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({ ...current, enabled: event.target.checked }))
              }
              className="mt-0.5 size-5 shrink-0 accent-brand"
            />
            <span className="text-sm leading-6 text-ink">
              รวมในแผน
              <span className="mt-0.5 block text-xs leading-5 text-muted">
                เอาออกจากแผนได้โดยไม่ต้องลบ เวลาของจุดอื่นจะคำนวณใหม่เหมือนไม่มีจุดนี้
              </span>
            </span>
          </label>
        </section>

        {legDraft ? (
          <section className="space-y-4 border-t border-line pt-5">
            <h3 className="text-sm font-semibold text-ink">การเดินทางไปจุดถัดไป</h3>

            <div className="rounded-lg border border-line bg-canvas px-3 py-2">
              <p className="text-xs text-muted">ไปยัง</p>
              <p className="mt-0.5 truncate text-sm font-medium text-ink">
                {legDraft.destinationName}
              </p>
            </div>

            <Field label="เดินทางด้วย">
              <Select
                value={legDraft.transportMode}
                disabled={busy}
                onChange={(event) =>
                  setLegDraft((current) =>
                    current
                      ? { ...current, transportMode: event.target.value as TransportMode }
                      : current,
                  )
                }
              >
                {TRANSPORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {TRANSPORT_MODE_LABELS[mode]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ใช้เวลาเดินทาง" hint="เว้นว่างได้ แต่เวลาถึงของจุดถัดไปจะยังคำนวณไม่ได้">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-24">
                  <TextInput
                    inputMode="numeric"
                    aria-label="เวลาเดินทาง (นาที)"
                    placeholder="—"
                    value={
                      legDraft.manualDurationMinutes === null
                        ? ''
                        : String(legDraft.manualDurationMinutes)
                    }
                    disabled={busy}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        setLegDraft((current) =>
                          current ? { ...current, manualDurationMinutes: null } : current,
                        );
                        return;
                      }
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1440) {
                        setLegDraft((current) =>
                          current
                            ? { ...current, manualDurationMinutes: Math.round(parsed) }
                            : current,
                        );
                      }
                    }}
                  />
                </span>
                <span className="text-sm text-muted">นาที</span>
                {legDraft.manualDurationMinutes !== null ? (
                  <span className="text-sm text-muted">
                    ({formatDuration(legDraft.manualDurationMinutes)})
                  </span>
                ) : null}
              </span>
            </Field>

            <Field label="โน้ตการเดินทาง">
              <TextArea
                value={legDraft.notes ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setLegDraft((current) =>
                    current ? { ...current, notes: event.target.value } : current,
                  )
                }
              />
            </Field>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onRecordExpense(legDraft)}
            >
              <ReceiptText aria-hidden className="size-4" />
              บันทึกเป็นค่าใช้จ่าย
            </Button>
          </section>
        ) : null}

        <section className="space-y-3 border-t border-line pt-5">
          {otherDays.length > 0 ? (
            <Field label="ย้ายไปวันอื่น" hint="ย้ายทันทีโดยไม่ต้องกดยืนยัน">
              <div className="flex items-center gap-2">
                <MoveRight aria-hidden className="size-4 shrink-0 text-muted" />
                <Select
                  value=""
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.value) onMoveToDay(event.target.value);
                  }}
                >
                  <option value="">เลือกวันปลายทาง</option>
                  {otherDays.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.label}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          ) : null}

          <Button type="button" variant="danger" size="sm" disabled={busy} onClick={onDelete}>
            <Trash2 aria-hidden className="size-4" />
            ลบสถานที่นี้
          </Button>
        </section>
      </div>
    </Sheet>
  );
}
