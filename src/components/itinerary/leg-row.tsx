'use client';

import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Footprints, Loader2, ReceiptText, Train, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { formatDistance } from '@/lib/itinerary/geo';
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  formatClock,
  formatDuration,
  type ScheduleLegResult,
  type TransportMode,
} from '@/lib/itinerary/schedule';
import type { RouteAlternative, RouteResult } from '@/lib/itinerary/providers/types';
import type { LegRouteState } from './use-routing';

const MODE_ICONS: Record<TransportMode, typeof Car> = {
  driving: Car,
  transit: Train,
  walking: Footprints,
};

export interface LegRowProps {
  legKey: string;
  color: string;
  originName: string;
  destinationName: string;
  mode: TransportMode;
  /** False when the pair has no saved preference and is using the day default. */
  fromStoredPreference: boolean;
  manualDurationMinutes: number | null;
  visibleOnMap: boolean;
  selectedRouteReference: string | null;
  timing: ScheduleLegResult | undefined;
  route: LegRouteState | undefined;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onChangeMode: (mode: TransportMode) => void;
  onChangeManualDuration: (minutes: number | null) => void;
  onToggleVisible: (next: boolean) => void;
  onChooseAlternative: (reference: string) => void;
  onRecordExpense: (alternative: RouteAlternative | null) => void;
}

function chosenAlternative(
  result: RouteResult | undefined,
  reference: string | null,
): RouteAlternative | null {
  if (!result || result.alternatives.length === 0) return null;
  // Never fall back to a different route silently when the saved one is gone —
  // the first alternative is the provider's own recommendation, and the UI
  // shows which one is selected.
  return (
    result.alternatives.find((alternative) => alternative.reference === reference) ??
    result.alternatives[0]
  );
}

export function LegRow({
  color,
  originName,
  destinationName,
  mode,
  fromStoredPreference,
  manualDurationMinutes,
  visibleOnMap,
  selectedRouteReference,
  timing,
  route,
  selected,
  busy,
  onSelect,
  onChangeMode,
  onChangeManualDuration,
  onToggleVisible,
  onChooseAlternative,
  onRecordExpense,
}: LegRowProps) {
  const [open, setOpen] = useState(false);
  const [manualInput, setManualInput] = useState(
    manualDurationMinutes === null ? '' : String(manualDurationMinutes),
  );
  const detailsId = useId();

  const loading = route?.phase === 'loading';
  const result = route?.phase === 'done' ? route.result : undefined;
  const alternative = chosenAlternative(result, selectedRouteReference);
  const providerFailed = result !== undefined && result.status !== 'ok';

  const durationText =
    timing?.travelMinutes !== null && timing?.travelMinutes !== undefined
      ? formatDuration(timing.travelMinutes)
      : null;

  return (
    <li className="relative py-1 pl-4 sm:pl-9">
      <span
        aria-hidden
        className="absolute left-[1.1rem] top-0 h-full w-1 rounded-full sm:left-[2.35rem]"
        style={{ backgroundColor: color, opacity: selected ? 1 : 0.35 }}
      />

      <div
        className={`ml-4 rounded-lg border bg-surface/70 ${
          selected ? 'border-brand ring-2 ring-brand/25' : 'border-line'
        }`}
      >
        <div className="flex items-start gap-2 p-2.5">
          <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
              <span className="font-medium text-ink">
                {loading ? (
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Loader2 aria-hidden className="size-3 animate-spin" />
                    กำลังหาเส้นทาง
                  </span>
                ) : durationText ? (
                  durationText
                ) : (
                  <span className="inline-flex items-center gap-1 text-accent">
                    <AlertTriangle aria-hidden className="size-3" />
                    ไม่ทราบเวลาเดินทาง
                  </span>
                )}
              </span>
              {alternative?.distanceMeters != null ? (
                <span>{formatDistance(alternative.distanceMeters)}</span>
              ) : null}
              {timing?.source === 'manual' ? (
                <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
                  ระบุเวลาเอง
                </span>
              ) : null}
              {timing && timing.transitWaitMinutes > 0 ? (
                <span>รอระหว่างทาง {formatDuration(timing.transitWaitMinutes)}</span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {originName} → {destinationName}
              {timing && !timing.incomplete
                ? ` · ออก ${formatClock(timing.departureMinutes)} ถึง ${formatClock(
                    timing.arrivalMinutes,
                  )}`
                : ''}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            <span className="sr-only">
              {open ? 'ย่อรายละเอียดเส้นทาง' : 'ดูรายละเอียดเส้นทาง'}
            </span>
          </button>
        </div>

        {/* The mode selector sits between the two stop cards, on the leg itself. */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-2.5 py-2">
          {TRANSPORT_MODES.map((candidate) => {
            const Icon = MODE_ICONS[candidate];
            const active = candidate === mode;
            return (
              <button
                key={candidate}
                type="button"
                disabled={busy}
                onClick={() => onChangeMode(candidate)}
                aria-pressed={active}
                className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium ${
                  active
                    ? 'border-brand bg-brand-soft text-brand-strong'
                    : 'border-line-strong bg-surface text-ink hover:bg-canvas'
                }`}
              >
                <Icon aria-hidden className="size-3.5" />
                {TRANSPORT_MODE_LABELS[candidate]}
              </button>
            );
          })}
          {!fromStoredPreference ? (
            <span className="text-[11px] text-muted">ค่าเริ่มต้นของวันนี้</span>
          ) : null}
        </div>

        {open ? (
          <div id={detailsId} className="space-y-3 border-t border-line px-2.5 py-3">
            {providerFailed ? (
              <p className="rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-2 text-xs leading-5 text-ink">
                {result?.message}
              </p>
            ) : null}

            {result && result.alternatives.length > 1 ? (
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold text-ink">
                  เส้นทางที่เลือกได้
                </legend>
                <ul className="space-y-1">
                  {result.alternatives.map((candidate) => (
                    <li key={candidate.reference}>
                      <label className="flex items-start gap-2 rounded-lg border border-line px-2 py-1.5 text-xs">
                        <input
                          type="radio"
                          name={`${detailsId}-alternative`}
                          checked={candidate.reference === alternative?.reference}
                          onChange={() => onChooseAlternative(candidate.reference)}
                          className="mt-0.5 size-4 accent-brand"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-ink">
                            {formatDuration(candidate.durationMinutes)}
                          </span>
                          {candidate.distanceMeters != null
                            ? ` · ${formatDistance(candidate.distanceMeters)}`
                            : ''}
                          {candidate.transferCount != null
                            ? ` · เปลี่ยนสาย ${candidate.transferCount} ครั้ง`
                            : ''}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}

            {/* Transit detail is shown only when the provider actually returned it. */}
            {alternative && alternative.steps.length > 0 ? (
              <ol className="space-y-2 border-l-2 border-line pl-3 text-xs leading-5">
                {alternative.steps.map((step, index) => (
                  <li key={index}>
                    <p className="font-medium text-ink">
                      {step.kind === 'walk' ? 'เดิน' : step.lineName ?? 'ขนส่งสาธารณะ'}
                      {step.durationMinutes != null
                        ? ` · ${formatDuration(step.durationMinutes)}`
                        : ''}
                      {step.distanceMeters != null
                        ? ` · ${formatDistance(step.distanceMeters)}`
                        : ''}
                    </p>
                    {step.boardStopName || step.alightStopName ? (
                      <p className="text-muted">
                        {step.boardStopName ? `ขึ้น ${step.boardStopName}` : ''}
                        {step.boardStopName && step.alightStopName ? ' → ' : ''}
                        {step.alightStopName ? `ลง ${step.alightStopName}` : ''}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}

            {alternative?.fareAmount ? (
              <p className="text-xs text-ink-soft">
                ค่าโดยสาร {alternative.fareAmount} {alternative.fareCurrency ?? ''}{' '}
                <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
                  ประมาณการ
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  ไม่ถูกนับรวมในยอดค่าใช้จ่ายหรือยอดโอน
                </span>
              </p>
            ) : null}

            <Field
              label="ระบุเวลาเอง"
              hint="ใช้เมื่อไม่มีข้อมูลจากผู้ให้บริการ เว้นว่างเพื่อกลับไปใช้ข้อมูลอัตโนมัติ"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="w-20">
                  <TextInput
                    inputMode="numeric"
                    aria-label="เวลาเดินทาง (นาที)"
                    value={manualInput}
                    disabled={busy}
                    onChange={(event) => setManualInput(event.target.value)}
                    onBlur={() => {
                      const trimmed = manualInput.trim();
                      if (!trimmed) {
                        if (manualDurationMinutes !== null) onChangeManualDuration(null);
                        return;
                      }
                      const parsed = Number(trimmed);
                      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1440) {
                        onChangeManualDuration(Math.round(parsed));
                      } else {
                        setManualInput(
                          manualDurationMinutes === null ? '' : String(manualDurationMinutes),
                        );
                      }
                    }}
                  />
                </span>
                <span className="text-sm text-muted">นาที</span>
              </span>
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={visibleOnMap}
                disabled={busy}
                onChange={(event) => onToggleVisible(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-brand"
              />
              <span className="leading-6 text-ink">
                แสดงบนแผนที่
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  ซ่อนเฉพาะบนแผนที่ ไม่กระทบแผนหรือเวลารวม
                </span>
              </span>
            </label>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onRecordExpense(alternative)}
            >
              <ReceiptText aria-hidden className="size-4" />
              บันทึกเป็นค่าใช้จ่าย
            </Button>

            {result?.attribution ? (
              <p className="text-[11px] text-muted">{result.attribution}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
