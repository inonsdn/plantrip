'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateWithWeekday } from '@/lib/format';

export interface DayStripDay {
  id: string;
  localDate: string;
  /** How many places are in the plan that day — nothing when the day is empty. */
  stopCount: number;
}

/**
 * The day switcher, pinned to the top of the viewport while the list scrolls.
 *
 * A long trip runs off the edge of a phone, and a strip that is cut off with no
 * sign of it reads as the whole trip. The fades only appear on the side that
 * actually has more, so they say something true rather than decorating both
 * ends regardless.
 */
export function DayStrip({
  days,
  selectedId,
  onSelect,
}: {
  days: readonly DayStripDay[];
  selectedId: string;
  onSelect: (dayId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const remaining = node.scrollWidth - node.clientWidth - node.scrollLeft;
    setOverflow({ start: node.scrollLeft > 4, end: remaining > 4 });
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, days.length]);

  // Picking the fifteenth day of a trip must not leave it off screen.
  useEffect(() => {
    buttons.current
      .get(selectedId)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-canvas px-4 py-2 sm:mx-0 sm:px-0">
      <div className="relative">
        <div
          ref={scroller}
          onScroll={measure}
          className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex w-max gap-1.5">
            {days.map((day, index) => {
              const active = day.id === selectedId;
              return (
                <li key={day.id}>
                  <button
                    ref={(element) => {
                      if (element) buttons.current.set(day.id, element);
                      else buttons.current.delete(day.id);
                    }}
                    type="button"
                    onClick={() => onSelect(day.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`inline-flex min-h-11 flex-col items-start justify-center rounded-lg border px-2.5 text-left transition-colors ${
                      active
                        ? 'border-brand bg-brand-soft text-brand-strong'
                        : 'border-line bg-surface text-ink hover:bg-canvas'
                    }`}
                  >
                    <span
                      className={`text-[10px] leading-4 ${active ? 'text-brand-strong/80' : 'text-muted'}`}
                    >
                      วันที่ {index + 1}
                      {day.stopCount > 0 ? ` · ${day.stopCount}` : ''}
                    </span>
                    <span className="text-[13px] font-semibold leading-4">
                      {formatDateWithWeekday(day.localDate)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {overflow.start ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-canvas to-transparent"
          />
        ) : null}
        {overflow.end ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-canvas to-transparent"
          />
        ) : null}
      </div>
    </div>
  );
}
