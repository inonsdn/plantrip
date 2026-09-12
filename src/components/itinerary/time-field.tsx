'use client';

import { useMemo, useState } from 'react';
import { Select } from '@/components/ui/field';

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTE_STEP = 5;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
  String(index * MINUTE_STEP).padStart(2, '0'),
);

/**
 * Hour and minute pickers instead of `<input type="time">`.
 *
 * The native control on iOS reports every value the wheel passes through, so a
 * scroll towards 15:00 saves 13:00, 14:00 and everything between on the way —
 * and it renders wider than the box it sits in. Two selects commit exactly once,
 * when a value is chosen, and lay out predictably.
 */
export function TimeField({
  value,
  onChange,
  disabled,
  clearable = false,
  hourLabel = 'ชั่วโมง',
  minuteLabel = 'นาที',
}: {
  /** `HH:MM`, or null when the time is not set (only with `clearable`). */
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  clearable?: boolean;
  hourLabel?: string;
  minuteLabel?: string;
}) {
  // A draft so both pickers respond at once: the saved value only comes back
  // after a round trip, and waiting for it would leave the minute picker inert
  // until the hour had finished saving.
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(value);
  }

  const [hour, minute] = useMemo(() => {
    const match = /^(\d{1,2}):(\d{2})/.exec(draft ?? '');
    if (!match) return [null, null] as const;
    return [match[1].padStart(2, '0'), match[2]] as const;
  }, [draft]);

  // A time saved before this control existed can sit off the five-minute grid;
  // it stays selectable rather than silently jumping to the nearest step.
  const minuteOptions = useMemo(
    () => (minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES),
    [minute],
  );

  function emit(nextHour: string | null, nextMinute: string | null) {
    const next =
      nextHour === null && nextMinute === null
        ? null
        : `${nextHour ?? '00'}:${nextMinute ?? '00'}`;
    setDraft(next);
    onChange(next);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-[5.5rem]">
        <Select
          aria-label={hourLabel}
          value={hour ?? ''}
          disabled={disabled}
          onChange={(event) =>
            emit(event.target.value || null, event.target.value ? (minute ?? '00') : null)
          }
        >
          {clearable ? <option value="">--</option> : null}
          {HOURS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </span>
      <span aria-hidden className="text-muted">
        :
      </span>
      <span className="w-[5.5rem]">
        <Select
          aria-label={minuteLabel}
          value={minute ?? ''}
          disabled={disabled}
          onChange={(event) => emit(hour ?? '00', event.target.value || null)}
        >
          {clearable ? <option value="">--</option> : null}
          {minuteOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </span>
      {clearable && draft !== null ? (
        <button
          type="button"
          onClick={() => emit(null, null)}
          disabled={disabled}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          ล้าง
        </button>
      ) : null}
    </div>
  );
}
