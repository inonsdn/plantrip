'use client';

import { useMemo } from 'react';
import { MemberAvatar } from '@/components/ui/avatar';
import { TextInput } from '@/components/ui/field';
import { formatMoney, toMinorUnits } from '@/lib/money';
import { SPLIT_METHOD_HINTS, SPLIT_METHOD_LABELS, SPLIT_METHODS, computeSplits, type SplitMethod } from '@/lib/split';
import type { TripMemberView } from '@/lib/types';

export interface SplitPreview {
  amountByMember: Map<string, number>;
  error: string | null;
}

export function useSplitPreview(
  method: SplitMethod,
  totalMinor: number,
  participantIds: readonly string[],
  values: Record<string, string>,
  baseCurrency: string,
): SplitPreview {
  return useMemo(() => {
    const amountByMember = new Map<string, number>();
    if (totalMinor <= 0 || participantIds.length === 0) {
      return { amountByMember, error: null };
    }
    try {
      const lines = computeSplits(
        method,
        totalMinor,
        participantIds.map((memberId) => ({
          memberId,
          value:
            method === 'exact' && values[memberId]
              ? toMinorUnits(values[memberId], baseCurrency)
              : values[memberId] ?? null,
        })),
      );
      for (const line of lines) amountByMember.set(line.memberId, line.amountMinor);
      return { amountByMember, error: null };
    } catch (error) {
      return {
        amountByMember,
        error: error instanceof Error ? error.message : 'คำนวณการหารไม่สำเร็จ',
      };
    }
  }, [method, totalMinor, participantIds, values, baseCurrency]);
}

const VALUE_PLACEHOLDER: Record<SplitMethod, string> = {
  equal: '',
  exact: '0.00',
  percent: '%',
  shares: '1',
  personal: '',
};

export function SplitEditor({
  members,
  participantIds,
  onToggleParticipant,
  onSelectOnly,
  onSelectAll,
  onClearAll,
  method,
  onMethodChange,
  values,
  onValueChange,
  baseCurrency,
  totalMinor,
  preview,
}: {
  members: TripMemberView[];
  participantIds: string[];
  onToggleParticipant: (memberId: string) => void;
  onSelectOnly: (memberId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  method: SplitMethod;
  onMethodChange: (method: SplitMethod) => void;
  values: Record<string, string>;
  onValueChange: (memberId: string, value: string) => void;
  baseCurrency: string;
  totalMinor: number;
  preview: SplitPreview;
}) {
  const allSelected = participantIds.length === members.length;
  const needsValue = method === 'exact' || method === 'percent' || method === 'shares';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="วิธีหาร" className="flex flex-wrap gap-1.5">
          {SPLIT_METHODS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={method === option}
              onClick={() => onMethodChange(option)}
              className={`min-h-9 rounded-lg border px-2.5 text-sm font-medium transition-colors ${
                method === option
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-line-strong bg-surface text-ink-soft hover:bg-canvas'
              }`}
            >
              {SPLIT_METHOD_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs leading-5 text-muted">{SPLIT_METHOD_HINTS[method]}</p>

      {method !== 'personal' ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected}
            className="text-sm font-medium text-brand-strong underline underline-offset-2 disabled:text-muted disabled:no-underline"
          >
            เลือกทุกคน
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={participantIds.length === 0}
            className="text-sm font-medium text-ink-soft underline underline-offset-2 disabled:text-muted disabled:no-underline"
          >
            ล้างการเลือก
          </button>
        </div>
      ) : null}

      <ul className="divide-y divide-line rounded-lg border border-line">
        {members.map((member) => {
          const selected = participantIds.includes(member.id);
          const amount = preview.amountByMember.get(member.id);
          return (
            <li key={member.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {method === 'personal' ? (
                <label className="flex min-h-11 min-w-24 flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="radio"
                    name="personal-member"
                    checked={selected}
                    onChange={() => onSelectOnly(member.id)}
                    className="size-5 accent-brand focus:outline-2 focus:outline-offset-2 focus:outline-brand"
                  />
                  <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{member.displayName}</span>
                </label>
              ) : (
                <label className="flex min-h-11 min-w-24 flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleParticipant(member.id)}
                    className="size-5 accent-brand focus:outline-2 focus:outline-offset-2 focus:outline-brand"
                  />
                  <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{member.displayName}</span>
                </label>
              )}

              {needsValue && selected ? (
                // Fixed-width wrapper: TextInput itself is always w-full.
                <div className="ml-auto w-20 shrink-0 sm:w-24">
                  <TextInput
                    aria-label={`${SPLIT_METHOD_LABELS[method]} ของ ${member.displayName}`}
                    value={values[member.id] ?? ''}
                    onChange={(event) => onValueChange(member.id, event.target.value)}
                    inputMode="decimal"
                    placeholder={VALUE_PLACEHOLDER[method]}
                    className="text-right tabular"
                  />
                </div>
              ) : null}

              <span className="tabular w-20 shrink-0 text-right text-sm text-ink-soft sm:w-24">
                {selected && amount !== undefined && totalMinor > 0
                  ? formatMoney(amount, baseCurrency)
                  : selected
                    ? '—'
                    : ''}
              </span>
            </li>
          );
        })}
      </ul>

      {preview.error ? (
        <p role="alert" className="text-sm text-negative">
          {preview.error}
        </p>
      ) : null}
    </div>
  );
}
