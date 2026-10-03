'use client';

import { MoonStar, Pencil } from 'lucide-react';
import type { DaySummary } from '@/lib/itinerary/timeline';

/**
 * The day, in two lines, and the way into its settings.
 *
 * The second line only ever adds up what it can actually see. A day with a
 * journey nobody has timed says so beside its totals rather than quietly
 * presenting the part it could reach as the whole thing.
 */
export function DaySummaryBar({ summary, onEdit }: { summary: DaySummary; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left hover:bg-canvas/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{summary.startLine}</span>
        {/*
          One line, always. The totals give way first and the caveat never
          does: a summary squeezed down to only its reassuring half would be
          the exact thing this line exists to prevent.
        */}
        <span className="mt-0.5 flex items-center gap-2 text-xs leading-5">
          {summary.facts.length > 0 ? (
            <span className="truncate text-ink-soft">{summary.facts.join(' · ')}</span>
          ) : null}
          {summary.caveat ? (
            <span className="shrink-0 text-accent">{summary.caveat}</span>
          ) : null}
          {summary.crossesMidnight ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-brand-strong">
              <MoonStar aria-hidden className="size-3" />
              ข้ามเที่ยงคืน
            </span>
          ) : null}
        </span>
      </span>
      <Pencil aria-hidden className="size-4 shrink-0 text-muted" />
      <span className="sr-only">ตั้งค่าวันนี้</span>
    </button>
  );
}
