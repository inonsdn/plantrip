'use client';

import { useState } from 'react';
import { MoveRight, ReceiptText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  SCHEDULE_WARNINGS,
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
  arrivalLocalTime: string | null;
  departureLocalTime: string | null;
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
 * Both are drafts: nothing moves until "ยืนยัน". The save then goes through the
 * queue, so the dialog closes at once and the change is already on the list —
 * if the server refuses it, the list snaps back and a toast says why.
 */
export function StopDialog({
  open,
  stop,
  order,
  timing,
  leg,
  otherDays,
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
    arrivalLocalTime: stop.arrivalLocalTime?.slice(0, 5) ?? null,
    departureLocalTime: stop.departureLocalTime?.slice(0, 5) ?? null,
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
    : `ถึง ${formatClock(timing?.arrivalMinutes)} · ออก ${formatClock(timing?.departureMinutes)}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={stop.name}
      description={order === null ? 'ไม่รวมในแผน' : `ลำดับที่ ${order}`}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={confirm}>
            ยืนยัน
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">ข้อมูลสถานที่</h3>

          <Field label="ชื่อสถานที่" error={nameError} required>
            <TextInput
              value={draft.name}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
                if (nameError) setNameError(null);
              }}
            />
          </Field>

          <div
            className={`rounded-lg border px-3 py-2 ${
              timing?.warning ? 'border-negative/40 bg-negative-soft' : 'border-line bg-canvas'
            }`}
          >
            <p className="text-xs text-muted">เวลาในแผน</p>
            <p className="mt-0.5 text-sm font-medium text-ink">{arrivalText}</p>
            {timing?.warning ? (
              <p className="mt-1 text-xs font-medium text-negative">
                {SCHEDULE_WARNINGS[timing.warning.reason]}
              </p>
            ) : null}
          </div>

          <Field
            label="ถึงกี่โมง"
            hint="ใส่เองได้ ถ้าเว้นไว้ แผนจะคิดให้จากจุดก่อนหน้าเมื่อทำได้"
          >
            <TimeField
              value={draft.arrivalLocalTime}
              clearable
              hourLabel="ชั่วโมงที่ถึง"
              minuteLabel="นาทีที่ถึง"
              onChange={(next) => setDraft((current) => ({ ...current, arrivalLocalTime: next }))}
            />
          </Field>

          <Field
            label="ออกจากที่นี่กี่โมง"
            hint="ใส่เองได้ ถ้าเว้นไว้ แผนจะคิดจากเวลาถึงบวกเวลาที่อยู่"
          >
            <TimeField
              value={draft.departureLocalTime}
              clearable
              hourLabel="ชั่วโมงที่ออก"
              minuteLabel="นาทีที่ออก"
              onChange={(next) => setDraft((current) => ({ ...current, departureLocalTime: next }))}
            />
          </Field>

          <Field label="อยู่ที่นี่นานเท่าไร" hint="เลือกไม่ระบุได้ถ้ายังไม่รู้">
            <DurationField
              value={draft.visitDurationMinutes}
              onChange={(next) =>
                setDraft((current) => ({ ...current, visitDurationMinutes: next }))
              }
            />
          </Field>

          <Field label="โน้ต">
            <TextArea
              value={draft.notes ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </Field>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.enabled}
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

          <Button type="button" variant="danger" size="sm" onClick={onDelete}>
            <Trash2 aria-hidden className="size-4" />
            ลบสถานที่นี้
          </Button>
        </section>
      </div>
    </Sheet>
  );
}
