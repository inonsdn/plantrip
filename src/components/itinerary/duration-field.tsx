'use client';

import { useMemo, useState } from 'react';
import { TextInput } from '@/components/ui/field';
import { formatDuration } from '@/lib/itinerary/schedule';

const SHORTCUTS = [15, 30, 60, 120] as const;

/**
 * How long to stay somewhere, or "ไม่ระบุ".
 *
 * Null is genuinely unknown, not zero: the schedule stops computing departure
 * times from that stop onwards rather than pretending the visit takes no time.
 */
export function DurationField({
  value,
  onChange,
  disabled,
  label = 'เวลาที่ใช้ (นาที)',
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  // A draft so typing feels immediate; the saved value replaces it when it
  // comes back, and a rejected edit is rolled back by the same sync.
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(value === null ? '' : String(value));
  }

  const options = useMemo(
    () => [{ minutes: null as number | null, text: 'ไม่ระบุ' }, ...SHORTCUTS.map((minutes) => ({ minutes, text: formatDuration(minutes) }))],
    [],
  );

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (value !== null) onChange(null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1440) {
      const rounded = Math.round(parsed);
      if (rounded !== value) onChange(rounded);
      else setDraft(String(rounded));
      return;
    }
    setDraft(value === null ? '' : String(value));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option.text}
          type="button"
          disabled={disabled}
          aria-pressed={value === option.minutes}
          onClick={() => {
            setDraft(option.minutes === null ? '' : String(option.minutes));
            onChange(option.minutes);
          }}
          className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${
            value === option.minutes
              ? 'border-brand bg-brand-soft text-brand-strong'
              : 'border-line-strong bg-surface text-ink hover:bg-canvas'
          }`}
        >
          {option.text}
        </button>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="w-20">
          <TextInput
            inputMode="numeric"
            aria-label={label}
            placeholder="—"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
          />
        </span>
        <span className="text-sm text-muted">นาที</span>
      </span>
    </div>
  );
}
