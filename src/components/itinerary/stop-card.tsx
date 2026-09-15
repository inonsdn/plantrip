'use client';

import { ChevronRight, Clock, GripVertical } from 'lucide-react';
import { formatClock, formatDuration, type ScheduleStopResult } from '@/lib/itinerary/schedule';
import type { ItineraryStopView } from '@/lib/itinerary/types';

export interface StopCardProps {
  stop: ItineraryStopView;
  /** 1-based order among enabled stops; null when the stop is excluded. */
  order: number | null;
  timing: ScheduleStopResult | undefined;
  /** Why the time is not known yet, already phrased for the reader. */
  blockedReason: string | null;
  onOpen: () => void;
  /** Pointer-driven reordering; see use-reorder.ts. */
  onGripPointerDown: (event: React.PointerEvent) => void;
  registerElement: (element: HTMLLIElement | null) => void;
  dragging: boolean;
}

/**
 * One place, at a glance. Everything editable lives in the dialog the card
 * opens, so the list stays a list.
 */
export function StopCard({
  stop,
  order,
  timing,
  blockedReason,
  onOpen,
  onGripPointerDown,
  registerElement,
  dragging,
}: StopCardProps) {
  const incomplete = timing?.incomplete ?? true;

  return (
    <li
      ref={registerElement}
      className={`flex items-stretch overflow-hidden rounded-xl border bg-surface transition-shadow ${
        dragging ? 'border-brand shadow-lg shadow-ink/15 ring-2 ring-brand' : 'border-line'
      } ${stop.enabled ? '' : 'bg-canvas/60'}`}
    >
      {/*
        The whole left rail is the drag handle — the number people already look
        at, plus a grip — and it is a separate control from the card body, so
        dragging never opens the dialog. `touch-none` stops the page scrolling
        out from under the drag on a phone.
      */}
      <button
        type="button"
        onPointerDown={onGripPointerDown}
        className="flex w-12 shrink-0 touch-none cursor-grab flex-col items-center justify-center gap-1 self-stretch border-r border-line bg-canvas/70 text-muted hover:bg-canvas hover:text-ink active:cursor-grabbing"
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
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3 pr-2 text-left hover:bg-canvas/60"
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-semibold ${
              stop.enabled ? 'text-ink' : 'text-muted line-through decoration-muted/50'
            }`}
          >
            {stop.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
            {stop.enabled ? (
              incomplete ? (
                <span className="text-muted">{blockedReason ?? 'เวลายังคำนวณไม่ได้'}</span>
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
              <span className="font-medium text-muted">ไม่รวมในแผน</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-3" />
              {stop.visitDurationMinutes === null
                ? 'ไม่ระบุเวลา'
                : formatDuration(stop.visitDurationMinutes)}
            </span>
          </span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
      </button>
    </li>
  );
}
