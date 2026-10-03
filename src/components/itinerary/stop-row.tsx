'use client';

import {
  Bus,
  Car,
  CarTaxiFront,
  ChevronRight,
  Clock,
  Footprints,
  GripVertical,
  Plane,
  Ship,
  TrainFront,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  SCHEDULE_WARNINGS,
  formatDuration,
  type ScheduleStopResult,
  type TransportMode,
} from '@/lib/itinerary/schedule';
import type { StopTimeLine, TravelLine } from '@/lib/itinerary/timeline';
import type { ItineraryStopView } from '@/lib/itinerary/types';

const TRANSPORT_ICONS: Record<TransportMode, LucideIcon> = {
  walking: Footprints,
  driving: Car,
  taxi: CarTaxiFront,
  transit: Bus,
  train: TrainFront,
  flight: Plane,
  ferry: Ship,
};

/**
 * The thread the day hangs from.
 *
 * Drawn per row rather than once behind the list: rows are different heights,
 * so a single line down the side cannot know where the first and last dots are.
 * Each row owns the segment above its dot and the segment below it, and the
 * rail stretches through the row's own padding, which is what makes the line
 * continuous across the gaps.
 */
function Rail({
  children,
  openAbove,
  openBelow,
}: {
  children?: React.ReactNode;
  openAbove: boolean;
  openBelow: boolean;
}) {
  return (
    <div aria-hidden className="flex w-6 shrink-0 flex-col items-center self-stretch">
      <span className={`h-2.5 w-px flex-none ${openAbove ? 'bg-line-strong' : 'bg-transparent'}`} />
      {children}
      <span className={`w-px flex-1 ${openBelow ? 'bg-line-strong' : 'bg-transparent'}`} />
    </div>
  );
}

export interface StopRowProps {
  stop: ItineraryStopView;
  /** 1-based order among the stops in the plan; null when this one is left out. */
  order: number | null;
  timing: ScheduleStopResult | undefined;
  /** What this row says about its own time; see lib/itinerary/timeline.ts. */
  line: StopTimeLine | undefined;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  /** Pointer-driven reordering; see use-reorder.ts. */
  onGripPointerDown: (event: React.PointerEvent) => void;
  registerElement: (element: HTMLLIElement | null) => void;
  dragging: boolean;
}

/**
 * One place on the timeline.
 *
 * The name is the row; everything else is a quiet second line under it. Tapping
 * the row opens the same dialog as before — the grip beside it is a separate
 * control, so a drag can never be mistaken for a tap.
 */
export function StopRow({
  stop,
  order,
  timing,
  line,
  first,
  last,
  onOpen,
  onGripPointerDown,
  registerElement,
  dragging,
}: StopRowProps) {
  const warning = timing?.warning ?? null;
  const body = dragging
    ? 'bg-brand-soft ring-2 ring-brand'
    : warning
      ? 'bg-negative-soft/60'
      : 'hover:bg-canvas/70';

  return (
    <li ref={registerElement} className="flex gap-2.5">
      <Rail openAbove={!first} openBelow={!last}>
        <span
          className={`inline-flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-bold ${
            stop.enabled
              ? 'bg-brand text-white'
              : 'border border-dashed border-line-strong bg-surface text-muted'
          }`}
        >
          {order ?? '—'}
        </span>
      </Rail>

      <div className={`flex min-w-0 flex-1 items-start rounded-xl pb-2 transition-colors ${body}`}>
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2 py-1 text-left"
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere] ${
                stop.enabled ? 'text-ink' : 'text-muted line-through decoration-muted/50'
              }`}
            >
              {stop.name}
            </span>

            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-5">
              {!stop.enabled ? (
                <span className="font-medium text-muted">ไม่รวมในแผน</span>
              ) : line?.kind === 'range' || line?.kind === 'partial' ? (
                <span className="tabular font-medium text-ink-soft">{line.text}</span>
              ) : line?.kind === 'blocked' ? (
                <span className="text-muted">{line.text}</span>
              ) : null}

              {stop.visitDurationMinutes === null ? null : (
                <span className="inline-flex items-center gap-1 text-ink-soft">
                  <Clock aria-hidden className="size-3" />
                  {formatDuration(stop.visitDurationMinutes)}
                </span>
              )}

              {timing && timing.waitMinutes > 0 ? (
                <span className="text-accent">รอ {formatDuration(timing.waitMinutes)}</span>
              ) : null}
            </span>

            {stop.notes ? (
              <span className="mt-0.5 block truncate text-xs leading-5 text-muted">
                {stop.notes}
              </span>
            ) : null}

            {warning ? (
              <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-negative">
                <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                {SCHEDULE_WARNINGS[warning.reason]}
              </span>
            ) : null}
          </span>
          <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
        </button>

        {/*
          Small, but a whole 44px of thumb: `touch-none` stops the page scrolling
          out from under the drag, and being its own button is what keeps a drag
          from opening the dialog.
        */}
        <button
          type="button"
          onPointerDown={onGripPointerDown}
          className="flex min-h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-r-xl text-muted hover:text-ink active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-4" />
          <span className="sr-only">ลากเพื่อจัดลำดับ {stop.name}</span>
        </button>
      </div>
    </li>
  );
}

/**
 * The journey between two places, on the thread between their dots.
 *
 * Only drawn when somebody has actually said something about it — a time, or a
 * way of getting there. The pairs nobody has touched keep the plain line.
 */
export function TravelRow({
  travel,
  originName,
  onOpen,
}: {
  travel: TravelLine;
  originName: string;
  onOpen: () => void;
}) {
  const Icon = TRANSPORT_ICONS[travel.mode];

  return (
    <li className="flex gap-2.5">
      <Rail openAbove openBelow />
      <div className="min-w-0 flex-1 pb-2">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`แก้ไขการเดินทางจาก ${originName}: ${travel.text}`}
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-canvas hover:text-ink"
        >
          <Icon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{travel.text}</span>
        </button>
      </div>
    </li>
  );
}
