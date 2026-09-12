'use client';

import { useId, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  MoveRight,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { DurationField } from './duration-field';
import { TimeField } from './time-field';
import {
  formatClock,
  formatDuration,
  type ScheduleStopResult,
} from '@/lib/itinerary/schedule';
import type { ItineraryStopView } from '@/lib/itinerary/types';

export interface StopCardProps {
  stop: ItineraryStopView;
  /** 1-based order among enabled stops; null when the stop is excluded. */
  order: number | null;
  timing: ScheduleStopResult | undefined;
  selected: boolean;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  otherDays: Array<{ id: string; label: string }>;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToDay: (dayId: string) => void;
  onToggleEnabled: (next: boolean) => void;
  onUpdate: (patch: {
    name?: string;
    notes?: string | null;
    visitDurationMinutes?: number | null;
    notBeforeLocalTime?: string | null;
  }) => void;
  onDelete: () => void;
  /** Pointer-driven reordering; see use-reorder.ts. */
  onGripPointerDown: (event: React.PointerEvent) => void;
  registerElement: (element: HTMLLIElement | null) => void;
  dragging: boolean;
}

export function StopCard({
  stop,
  order,
  timing,
  selected,
  busy,
  isFirst,
  isLast,
  otherDays,
  onSelect,
  onMoveUp,
  onMoveDown,
  onMoveToDay,
  onToggleEnabled,
  onUpdate,
  onDelete,
  onGripPointerDown,
  registerElement,
  dragging,
}: StopCardProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(stop.name);
  const [notes, setNotes] = useState(stop.notes ?? '');
  const detailsId = useId();

  const incomplete = timing?.incomplete ?? true;

  return (
    <li
      ref={registerElement}
      className={`overflow-hidden rounded-xl border bg-surface transition-shadow ${
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-line'
      } ${dragging ? 'shadow-lg shadow-ink/15 ring-2 ring-brand' : ''} ${
        stop.enabled ? '' : 'bg-canvas/60'
      }`}
    >
      <div className="flex items-stretch">
        {/*
          The whole left rail is the drag handle — the number people already
          look at, plus a grip — so reordering is something you reach for
          rather than something you have to discover. `touch-none` stops the
          page scrolling out from under the drag on a phone.
        */}
        <button
          type="button"
          disabled={busy}
          onPointerDown={onGripPointerDown}
          className="flex w-12 shrink-0 touch-none cursor-grab flex-col items-center justify-center gap-1 self-stretch rounded-l-xl border-r border-line bg-canvas/70 text-muted hover:bg-canvas hover:text-ink active:cursor-grabbing disabled:cursor-not-allowed"
        >
          <span
            aria-hidden
            className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${
              stop.enabled
                ? 'bg-brand text-white'
                : 'border border-dashed border-line-strong text-muted'
            }`}
          >
            {order ?? '—'}
          </span>
          <GripVertical aria-hidden className="size-4" />
          <span className="sr-only">ลากเพื่อจัดลำดับ {stop.name}</span>
        </button>

        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 py-3 pl-3 text-left"
          aria-pressed={selected}
        >
          <p
            className={`truncate text-sm font-semibold ${
              stop.enabled ? 'text-ink' : 'text-muted line-through decoration-muted/50'
            }`}
          >
            {stop.name}
          </p>
          {stop.address ? (
            <p className="truncate text-xs text-muted">{stop.address}</p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
            {stop.enabled ? (
              incomplete ? (
                <span className="text-muted">เวลายังคำนวณไม่ได้</span>
              ) : (
                <>
                  <span>
                    ถึง {formatClock(timing?.arrivalMinutes)} · ออก{' '}
                    {formatClock(timing?.departureMinutes)}
                  </span>
                  {timing && timing.waitMinutes > 0 ? (
                    <span className="text-accent">รอ {formatDuration(timing.waitMinutes)}</span>
                  ) : null}
                </>
              )
            ) : (
              <span className="text-muted">ไม่รวมในแผน</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-3" />
              {stop.visitDurationMinutes === null
                ? 'ไม่ระบุเวลา'
                : formatDuration(stop.visitDurationMinutes)}
            </span>
          </p>
        </button>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="my-2 mr-2 inline-flex size-9 shrink-0 items-center justify-center self-start rounded-lg text-muted hover:bg-canvas hover:text-ink"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          <span className="sr-only">{open ? 'ย่อรายละเอียด' : 'ดูรายละเอียด'}</span>
        </button>
      </div>

      {open ? (
        <div id={detailsId} className="space-y-4 border-t border-line px-3 py-3">
          <Field label="ชื่อสถานที่">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== stop.name) onUpdate({ name: trimmed });
                else setName(stop.name);
              }}
              disabled={busy}
            />
          </Field>

          <Field label="อยู่ที่นี่นานเท่าไร" hint="เลือกไม่ระบุได้ถ้ายังไม่รู้">
            <DurationField
              value={stop.visitDurationMinutes}
              disabled={busy}
              onChange={(next) => onUpdate({ visitDurationMinutes: next })}
            />
          </Field>

          <Field
            label="เวลาที่จะไปถึง"
            hint="ถ้าไปถึงก่อนเวลานี้ แผนจะนับเป็นเวลารอ เว้นว่างได้ถ้าไม่มีเวลาตายตัว"
          >
            <TimeField
              value={stop.notBeforeLocalTime?.slice(0, 5) ?? null}
              disabled={busy}
              clearable
              onChange={(next) => onUpdate({ notBeforeLocalTime: next })}
              hourLabel="ชั่วโมงที่จะไปถึง"
              minuteLabel="นาทีที่จะไปถึง"
            />
          </Field>

          <Field label="โน้ต">
            <TextArea
              value={notes}
              disabled={busy}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => {
                const next = notes.trim() ? notes.trim() : null;
                if (next !== (stop.notes ?? null)) onUpdate({ notes: next });
              }}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || isFirst}
              onClick={onMoveUp}
            >
              <ChevronUp aria-hidden className="size-4" />
              เลื่อนขึ้น
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || isLast}
              onClick={onMoveDown}
            >
              <ChevronDown aria-hidden className="size-4" />
              เลื่อนลง
            </Button>
            <Button
              type="button"
              variant={stop.enabled ? 'secondary' : 'primary'}
              size="sm"
              disabled={busy}
              onClick={() => onToggleEnabled(!stop.enabled)}
            >
              {stop.enabled ? 'ไม่รวมในแผน' : 'รวมในแผน'}
            </Button>
            <Button type="button" variant="danger" size="sm" disabled={busy} onClick={onDelete}>
              <Trash2 aria-hidden className="size-4" />
              ลบ
            </Button>
          </div>

          {otherDays.length > 0 ? (
            <Field label="ย้ายไปวันอื่น">
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
        </div>
      ) : null}
    </li>
  );
}
