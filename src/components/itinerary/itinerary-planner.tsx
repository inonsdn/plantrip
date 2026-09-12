'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, MapPin, MoonStar } from 'lucide-react';
import { Field, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useTripUi } from '@/components/trip/trip-shell';
import { formatDateWithWeekday } from '@/lib/format';
import { resolveLegs, type StoredLegPreference } from '@/lib/itinerary/legs';
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  computeDaySchedule,
  formatClock,
  formatDuration,
  legKey as makeLegKey,
  parseLocalTime,
  splitClock,
  type LegTravel,
  type TransportMode,
} from '@/lib/itinerary/schedule';
import type { RouteAlternative } from '@/lib/itinerary/providers/types';
import type { ItineraryDayView } from '@/lib/itinerary/types';
import {
  addItineraryStopAction,
  deleteItineraryStopAction,
  moveItineraryStopAction,
  reorderItineraryStopsAction,
  restoreItineraryStopAction,
  saveItineraryLegAction,
  updateItineraryDayAction,
  updateItineraryStopAction,
} from '@/lib/actions/itinerary';
import type { ActionResult } from '@/lib/actions/result';
import { AddStopPanel, type NewStopInput } from './add-stop';
import { useReorder } from './use-reorder';
import { LegRow } from './leg-row';
import { StopCard } from './stop-card';
import { TimeField } from './time-field';
import { useLegRoutes, type LegRouteRequest } from './use-routing';

const TIME_ZONES = [
  { value: 'Asia/Bangkok', label: 'ไทย (Asia/Bangkok)' },
  { value: 'Asia/Tokyo', label: 'ญี่ปุ่น (Asia/Tokyo)' },
  { value: 'Asia/Seoul', label: 'เกาหลีใต้ (Asia/Seoul)' },
  { value: 'Asia/Taipei', label: 'ไต้หวัน (Asia/Taipei)' },
  { value: 'Asia/Singapore', label: 'สิงคโปร์ (Asia/Singapore)' },
  { value: 'Asia/Hong_Kong', label: 'ฮ่องกง (Asia/Hong_Kong)' },
  { value: 'UTC', label: 'UTC' },
];

export function ItineraryPlanner({
  tripId,
  days,
  routingConfigured,
}: {
  tripId: string;
  days: ItineraryDayView[];
  /** False when no routing provider is set up: times are entered by hand. */
  routingConfigured: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { openExpense } = useTripUi();
  const [pending, startTransition] = useTransition();

  const [selectedDayId, setSelectedDayId] = useState<string | null>(days[0]?.id ?? null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedLegKey, setSelectedLegKey] = useState<string | null>(null);
  // A day that disappears (deleted elsewhere) must not leave the panel blank.
  const day = days.find((candidate) => candidate.id === selectedDayId) ?? days[0] ?? null;

  const stops = useMemo(() => day?.stops ?? [], [day]);

  const stored = useMemo<StoredLegPreference[]>(
    () =>
      (day?.legPreferences ?? []).map((preference) => ({
        legKey: makeLegKey(preference.originStopId, preference.destinationStopId),
        originStopId: preference.originStopId,
        destinationStopId: preference.destinationStopId,
        transportMode: preference.transportMode,
        selectedRouteReference: preference.selectedRouteReference,
        manualDurationMinutes: preference.manualDurationMinutes,
        visibleOnMap: preference.visibleOnMap,
      })),
    [day],
  );

  const legs = useMemo(
    () => resolveLegs(stops, stored, day?.defaultTransportMode ?? 'transit'),
    [stops, stored, day?.defaultTransportMode],
  );

  const stopById = useMemo(() => new Map(stops.map((stop) => [stop.id, stop])), [stops]);
  const startMinutes = parseLocalTime(day?.startLocalTime) ?? 9 * 60;

  // ---------------------------------------------------------------------
  // Two passes: a provisional schedule supplies the departure times the
  // routing requests need, then the results feed the schedule that is shown.
  // Legs only ever depend on legs before them, so this always settles.
  // ---------------------------------------------------------------------

  const manualTravel = useMemo<Record<string, LegTravel>>(() => {
    const table: Record<string, LegTravel> = {};
    for (const leg of legs) {
      if (leg.manualDurationMinutes !== null) {
        table[leg.legKey] = { minutes: leg.manualDurationMinutes, source: 'manual' };
      }
    }
    return table;
  }, [legs]);

  const scheduleInputStops = useMemo(
    () =>
      stops.map((stop) => ({
        id: stop.id,
        visitMinutes: stop.visitDurationMinutes,
        notBeforeMinutes: parseLocalTime(stop.notBeforeLocalTime),
        enabled: stop.enabled,
      })),
    [stops],
  );

  const provisional = useMemo(
    () =>
      computeDaySchedule({
        startMinutes,
        stops: scheduleInputStops,
        travelByLegKey: manualTravel,
      }),
    [startMinutes, scheduleInputStops, manualTravel],
  );

  const requests = useMemo<LegRouteRequest[]>(() => {
    // Without a provider there is nothing to ask, so nothing is asked.
    if (!day || !routingConfigured) return [];
    const timingByKey = new Map(provisional.legs.map((leg) => [leg.legKey, leg]));

    return legs
      .filter((leg) => leg.manualDurationMinutes === null)
      .map((leg) => {
        const origin = stopById.get(leg.originStopId);
        const destination = stopById.get(leg.destinationStopId);
        if (!origin || !destination) return null;
        // A place typed by hand has no coordinates, so there is nothing to ask.
        if (origin.latitude === null || origin.longitude === null) return null;
        if (destination.latitude === null || destination.longitude === null) return null;
        return {
          legKey: leg.legKey,
          mode: leg.transportMode,
          origin: { latitude: origin.latitude, longitude: origin.longitude },
          destination: { latitude: destination.latitude, longitude: destination.longitude },
          localDate: day.localDate,
          timeZone: day.timeZone,
          departureMinutes: timingByKey.get(leg.legKey)?.departureMinutes ?? null,
        } satisfies LegRouteRequest;
      })
      .filter((request) => request !== null);
  }, [day, routingConfigured, legs, provisional.legs, stopById]);

  const routes = useLegRoutes(tripId, requests);

  const chosenByLegKey = useMemo(() => {
    const table = new Map<string, RouteAlternative | null>();
    for (const leg of legs) {
      const state = routes[leg.legKey];
      const result = state?.phase === 'done' ? state.result : undefined;
      if (!result || result.alternatives.length === 0) {
        table.set(leg.legKey, null);
        continue;
      }
      table.set(
        leg.legKey,
        result.alternatives.find(
          (alternative) => alternative.reference === leg.selectedRouteReference,
        ) ?? result.alternatives[0],
      );
    }
    return table;
  }, [legs, routes]);

  const travelByLegKey = useMemo<Record<string, LegTravel>>(() => {
    const table: Record<string, LegTravel> = {};
    for (const leg of legs) {
      if (leg.manualDurationMinutes !== null) {
        table[leg.legKey] = { minutes: leg.manualDurationMinutes, source: 'manual' };
        continue;
      }
      const alternative = chosenByLegKey.get(leg.legKey);
      table[leg.legKey] = alternative
        ? {
            minutes: alternative.durationMinutes,
            source: 'provider',
            transitWaitMinutes: alternative.transitWaitMinutes ?? 0,
          }
        : // No provider answer and no manual time: genuinely unknown, never zero.
          { minutes: null, source: 'unknown' };
    }
    return table;
  }, [legs, chosenByLegKey]);

  const schedule = useMemo(
    () => computeDaySchedule({ startMinutes, stops: scheduleInputStops, travelByLegKey }),
    [startMinutes, scheduleInputStops, travelByLegKey],
  );

  const stopTiming = useMemo(
    () => new Map(schedule.stops.map((entry) => [entry.stopId, entry])),
    [schedule.stops],
  );
  const legTiming = useMemo(
    () => new Map(schedule.legs.map((entry) => [entry.legKey, entry])),
    [schedule.legs],
  );

  // ---------------------------------------------------------------------
  // mutations
  // ---------------------------------------------------------------------

  const run = useCallback(
    (
      action: () => Promise<ActionResult<unknown>>,
      options?: { success?: string; onSuccess?: () => void },
    ) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          showToast({ message: result.error, tone: 'error' });
          // Someone else's change is already live; reload so the panel shows it.
          router.refresh();
          return;
        }
        if (options?.success) showToast({ message: options.success, tone: 'success' });
        options?.onSuccess?.();
        router.refresh();
      });
    },
    [router, showToast],
  );

  function addStop(input: NewStopInput) {
    if (!day) return;
    run(
      () =>
        addItineraryStopAction({
          tripId,
          dayId: day.id,
          expectedVersion: day.version,
          ...input,
        }),
      { success: 'เพิ่มสถานที่แล้ว' },
    );
  }

  function updateStop(
    stopId: string,
    patch: {
      name?: string;
      notes?: string | null;
      visitDurationMinutes?: number;
      notBeforeLocalTime?: string | null;
      enabled?: boolean;
    },
  ) {
    if (!day) return;
    run(() =>
      updateItineraryStopAction({ tripId, stopId, expectedVersion: day.version, ...patch }),
    );
  }

  // Stable, so the drag's window listeners are not torn down and re-added on
  // every frame of the drag.
  const reorder = useCallback(
    (stopIds: string[]) => {
      if (!day) return;
      run(() =>
        reorderItineraryStopsAction({
          tripId,
          dayId: day.id,
          stopIds,
          expectedVersion: day.version,
        }),
      );
    },
    [day, run, tripId],
  );

  function moveBy(stopId: string, delta: number) {
    const index = stops.findIndex((stop) => stop.id === stopId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= stops.length) return;
    const next = stops.map((stop) => stop.id);
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next);
  }

  function deleteStop(stopId: string) {
    run(() => deleteItineraryStopAction(tripId, stopId), {
      onSuccess: () => {
        if (selectedStopId === stopId) setSelectedStopId(null);
        showToast({
          message: 'ลบสถานที่แล้ว',
          tone: 'info',
          action: {
            label: 'เลิกทำ',
            onClick: () =>
              run(() => restoreItineraryStopAction(tripId, stopId), {
                success: 'กู้คืนสถานที่แล้ว',
              }),
          },
        });
      },
    });
  }

  function saveLeg(
    originStopId: string,
    destinationStopId: string,
    patch: {
      transportMode?: TransportMode;
      selectedRouteReference?: string | null;
      manualDurationMinutes?: number | null;
      visibleOnMap?: boolean;
    },
  ) {
    if (!day) return;
    run(() =>
      saveItineraryLegAction({
        tripId,
        dayId: day.id,
        originStopId,
        destinationStopId,
        ...patch,
      }),
    );
  }

  function recordLegExpense(
    originName: string,
    destinationName: string,
    originStopId: string,
    destinationStopId: string,
    alternative: RouteAlternative | null,
  ) {
    if (!day) return;
    openExpense(null, {
      description: `เดินทาง: ${originName} → ${destinationName}`,
      category: 'transport',
      expenseDate: day.localDate,
      amount: alternative?.fareAmount ?? '',
      currencyCode: alternative?.fareCurrency ?? undefined,
      estimate: alternative?.fareAmount != null,
      itinerary: {
        dayId: day.id,
        originStopId,
        destinationStopId,
      },
    });
  }

  const stopIds = useMemo(() => stops.map((stop) => stop.id), [stops]);
  const drag = useReorder(stopIds, reorder);

  if (days.length === 0 || !day) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-8" />}
        title="ยังไม่มีวันในแผนการเดินทาง"
        description="กำหนดวันเริ่มต้นและวันสิ้นสุดของทริป แล้วกลับมาที่หน้านี้อีกครั้ง"
      />
    );
  }

  const crossesMidnight =
    schedule.endMinutes !== null && splitClock(schedule.endMinutes).dayOffset > 0;
  // Numbered from the order on screen, so the badges follow a card while it is
  // being dragged rather than showing where it used to be.
  const orderByStopId = new Map<string, number | null>();
  let visibleOrder = 0;
  for (const stopId of drag.order) {
    const candidate = stopById.get(stopId);
    if (!candidate) continue;
    orderByStopId.set(stopId, candidate.enabled ? (visibleOrder += 1) : null);
  }

  const otherDays = days
    .filter((candidate) => candidate.id !== day.id)
    .map((candidate) => ({ id: candidate.id, label: formatDateWithWeekday(candidate.localDate) }));

  const panel = (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="เริ่มวันเวลา">
            <TimeField
              value={day.startLocalTime.slice(0, 5)}
              disabled={pending}
              hourLabel="ชั่วโมงที่เริ่มวัน"
              minuteLabel="นาทีที่เริ่มวัน"
              onChange={(next) => {
                if (!next) return;
                run(() =>
                  updateItineraryDayAction({
                    tripId,
                    dayId: day.id,
                    startLocalTime: next,
                    expectedVersion: day.version,
                  }),
                );
              }}
            />
          </Field>
          <Field label="เขตเวลา">
            <Select
              value={day.timeZone}
              disabled={pending}
              onChange={(event) =>
                run(() =>
                  updateItineraryDayAction({
                    tripId,
                    dayId: day.id,
                    timeZone: event.target.value,
                    expectedVersion: day.version,
                  }),
                )
              }
            >
              {TIME_ZONES.some((zone) => zone.value === day.timeZone) ? null : (
                <option value={day.timeZone}>{day.timeZone}</option>
              )}
              {TIME_ZONES.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="การเดินทางเริ่มต้น" hint="ใช้กับช่วงเดินทางที่ยังไม่ได้เลือกเอง">
            <Select
              value={day.defaultTransportMode}
              disabled={pending}
              onChange={(event) =>
                run(() =>
                  updateItineraryDayAction({
                    tripId,
                    dayId: day.id,
                    defaultTransportMode: event.target.value as TransportMode,
                    expectedVersion: day.version,
                  }),
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
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink-soft">
          <div className="flex gap-1">
            <dt className="text-muted">เริ่ม</dt>
            <dd className="font-medium text-ink">{formatClock(schedule.startMinutes)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">จบ</dt>
            <dd className="font-medium text-ink">{formatClock(schedule.endMinutes)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">เดินทาง</dt>
            <dd>{formatDuration(schedule.totals.travelMinutes)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">อยู่ที่จุดต่างๆ</dt>
            <dd>{formatDuration(schedule.totals.visitMinutes)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">รอ</dt>
            <dd>
              {formatDuration(schedule.totals.waitMinutes)}
              {schedule.totals.transitWaitMinutes > 0
                ? ` (+ระหว่างทาง ${formatDuration(schedule.totals.transitWaitMinutes)})`
                : ''}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">รวมทั้งวัน</dt>
            <dd className="font-medium text-ink">
              {schedule.totals.elapsedMinutes === null
                ? 'ยังคำนวณไม่ได้'
                : formatDuration(schedule.totals.elapsedMinutes)}
            </dd>
          </div>
        </dl>

        {crossesMidnight ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-xs text-brand-strong">
            <MoonStar aria-hidden className="size-3.5" />
            แผนวันนี้ข้ามเที่ยงคืนไปวันถัดไป
          </p>
        ) : null}

        {!schedule.totals.complete ? (
          <p
            className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs leading-5 ${
              routingConfigured
                ? 'border-accent/30 bg-accent-soft text-ink'
                : 'border-line bg-canvas text-ink-soft'
            }`}
          >
            {routingConfigured
              ? 'มีช่วงเดินทางที่ยังไม่ทราบเวลา เวลาถึงของจุดหลังจากนั้นจึงยังคำนวณไม่ได้ ระบุเวลาเองที่ช่วงนั้นเพื่อให้แผนสมบูรณ์'
              : 'ยังมีช่วงเดินทางที่ยังไม่ได้ระบุเวลา กรอกเวลาเดินทางในแต่ละช่วงเพื่อให้เวลาถึงของจุดถัดไปคำนวณได้'}
          </p>
        ) : null}
      </div>

      <AddStopPanel
        tripId={tripId}
        searchEnabled={routingConfigured}
        busy={pending}
        onAdd={addStop}
      />

      {stops.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-8" />}
          title="ยังไม่มีสถานที่ในวันนี้"
          description="เพิ่มสถานที่แรกด้านบน แล้วลากการ์ดเพื่อจัดลำดับได้"
        />
      ) : (
        <ol className="space-y-1">
          {drag.order.map((stopId, index) => {
            const stop = stopById.get(stopId);
            if (!stop) return null;

            // While a card is under a finger the list shows only the cards, in
            // their new order: the journeys between them belong to the order
            // that is saved, not to the one being previewed.
            const legBefore = drag.draggingId
              ? undefined
              : legs.find((leg) => leg.destinationStopId === stop.id);
            const legOrigin = legBefore ? stopById.get(legBefore.originStopId) : undefined;

            return (
              <li key={stop.id}>
                {legBefore && legOrigin ? (
                  <ol>
                    <LegRow
                      legKey={legBefore.legKey}
                      originName={legOrigin.name}
                      destinationName={stop.name}
                      mode={legBefore.transportMode}
                      fromStoredPreference={legBefore.fromStoredPreference}
                      manualDurationMinutes={legBefore.manualDurationMinutes}
                      selectedRouteReference={legBefore.selectedRouteReference}
                      timing={legTiming.get(legBefore.legKey)}
                      route={routes[legBefore.legKey]}
                      routingConfigured={routingConfigured}
                      selected={selectedLegKey === legBefore.legKey}
                      busy={pending}
                      onSelect={() => {
                        setSelectedLegKey(legBefore.legKey);
                        setSelectedStopId(null);
                      }}
                      onChangeMode={(mode) =>
                        saveLeg(legBefore.originStopId, legBefore.destinationStopId, {
                          transportMode: mode,
                          // A different mode invalidates the route chosen for the
                          // previous one; it is never carried across.
                          selectedRouteReference: null,
                        })
                      }
                      onChangeManualDuration={(minutes) =>
                        saveLeg(legBefore.originStopId, legBefore.destinationStopId, {
                          manualDurationMinutes: minutes,
                        })
                      }
                      onChooseAlternative={(reference) =>
                        saveLeg(legBefore.originStopId, legBefore.destinationStopId, {
                          selectedRouteReference: reference,
                        })
                      }
                      onRecordExpense={(alternative) =>
                        recordLegExpense(
                          legOrigin.name,
                          stop.name,
                          legBefore.originStopId,
                          legBefore.destinationStopId,
                          alternative,
                        )
                      }
                    />
                  </ol>
                ) : null}

                <ol>
                  <StopCard
                    key={`${stop.id}:${stop.name}:${stop.notes ?? ''}`}
                    stop={stop}
                    order={orderByStopId.get(stop.id) ?? null}
                    timing={stopTiming.get(stop.id)}
                    selected={selectedStopId === stop.id}
                    busy={pending}
                    isFirst={index === 0}
                    isLast={index === drag.order.length - 1}
                    otherDays={otherDays}
                    onSelect={() => {
                      setSelectedStopId(stop.id);
                      setSelectedLegKey(null);
                    }}
                    onMoveUp={() => moveBy(stop.id, -1)}
                    onMoveDown={() => moveBy(stop.id, 1)}
                    onMoveToDay={(dayId) =>
                      run(() => moveItineraryStopAction(tripId, stop.id, dayId), {
                        success: 'ย้ายสถานที่แล้ว',
                      })
                    }
                    onToggleEnabled={(next) => updateStop(stop.id, { enabled: next })}
                    onUpdate={(patch) => updateStop(stop.id, patch)}
                    onDelete={() => deleteStop(stop.id)}
                    onGripPointerDown={(event) => drag.start(stop.id, event)}
                    registerElement={(element) => drag.register(stop.id, element)}
                    dragging={drag.draggingId === stop.id}
                  />
                </ol>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  return (
    // A list reads badly at full desktop width, so it keeps a column.
    <div className="mx-auto w-full max-w-3xl space-y-3">
      {/* Day selector: a horizontal strip so long trips stay one row. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {days.map((candidate, index) => {
            const active = candidate.id === day.id;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDayId(candidate.id);
                    setSelectedStopId(null);
                    setSelectedLegKey(null);
                  }}
                  aria-current={active ? 'true' : undefined}
                  className={`inline-flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 text-left ${
                    active
                      ? 'border-brand bg-brand-soft text-brand-strong'
                      : 'border-line bg-surface text-ink hover:bg-canvas'
                  }`}
                >
                  <span className="text-[11px] text-muted">วันที่ {index + 1}</span>
                  <span className="text-sm font-semibold">
                    {formatDateWithWeekday(candidate.localDate)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {panel}

    </div>
  );
}
