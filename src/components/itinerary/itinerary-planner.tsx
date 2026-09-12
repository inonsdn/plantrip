'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, List, Map as MapIcon, MoonStar, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useTripUi } from '@/components/trip/trip-shell';
import { formatDateWithWeekday } from '@/lib/format';
import { legColor } from '@/lib/itinerary/geo';
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
import { LegRow } from './leg-row';
import { MapView, type MapLeg, type MapStop } from './map-view';
import { StopCard } from './stop-card';
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
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [pickingOnMap, setPickingOnMap] = useState(false);
  const [picked, setPicked] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showApproximate, setShowApproximate] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);

  // A day that disappears (deleted elsewhere) must not leave the panel blank.
  const day = days.find((candidate) => candidate.id === selectedDayId) ?? days[0] ?? null;

  // Preserve the list's scroll offset across the mobile รายการ/แผนที่ switch.
  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    if (mobileView === 'list') element.scrollTop = listScroll.current;
  }, [mobileView]);

  function switchMobileView(next: 'list' | 'map') {
    if (mobileView === 'list' && listRef.current) listScroll.current = listRef.current.scrollTop;
    setMobileView(next);
  }

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

  const orderByStopId = useMemo(() => {
    const table = new Map<string, number | null>();
    let order = 0;
    for (const stop of stops) {
      table.set(stop.id, stop.enabled ? (order += 1) : null);
    }
    return table;
  }, [stops]);

  const colorByLegKey = useMemo(() => {
    const table = new Map<string, string>();
    legs.forEach((leg, index) => table.set(leg.legKey, legColor(index)));
    return table;
  }, [legs]);

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
      { success: 'เพิ่มสถานที่แล้ว', onSuccess: () => setPicked(null) },
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

  function reorder(stopIds: string[]) {
    if (!day) return;
    run(() =>
      reorderItineraryStopsAction({
        tripId,
        dayId: day.id,
        stopIds,
        expectedVersion: day.version,
      }),
    );
  }

  function moveBy(stopId: string, delta: number) {
    const index = stops.findIndex((stop) => stop.id === stopId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= stops.length) return;
    const next = stops.map((stop) => stop.id);
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next);
  }

  function dropOnto(targetId: string) {
    if (!dragKey || dragKey === targetId) {
      setDragKey(null);
      setDropKey(null);
      return;
    }
    const ids = stops.map((stop) => stop.id).filter((id) => id !== dragKey);
    const at = ids.indexOf(targetId);
    ids.splice(at < 0 ? ids.length : at, 0, dragKey);
    setDragKey(null);
    setDropKey(null);
    reorder(ids);
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

  // ---------------------------------------------------------------------
  // map inputs
  // ---------------------------------------------------------------------

  const mapStops = useMemo<MapStop[]>(
    () =>
      stops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        enabled: stop.enabled,
        order: orderByStopId.get(stop.id) ?? null,
      })),
    [stops, orderByStopId],
  );

  const mapLegs = useMemo<MapLeg[]>(
    () =>
      legs.map((leg) => {
        const origin = stopById.get(leg.originStopId);
        const destination = stopById.get(leg.destinationStopId);
        return {
          legKey: leg.legKey,
          color: colorByLegKey.get(leg.legKey) ?? legColor(0),
          originStopId: leg.originStopId,
          destinationStopId: leg.destinationStopId,
          geometry: chosenByLegKey.get(leg.legKey)?.geometry ?? null,
          // Map visibility is a saved per-leg preference and nothing more: it
          // never reaches the schedule or the day's totals.
          visible: leg.visibleOnMap,
          label: `${origin?.name ?? '?'} → ${destination?.name ?? '?'}`,
        };
      }),
    [legs, stopById, colorByLegKey, chosenByLegKey],
  );

  const attributions = useMemo(() => {
    const seen = new Set<string>();
    for (const state of Object.values(routes)) {
      if (state.phase === 'done' && state.result.attribution) seen.add(state.result.attribution);
    }
    return [...seen];
  }, [routes]);

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
  const selectedStop = selectedStopId ? stopById.get(selectedStopId) ?? null : null;
  const otherDays = days
    .filter((candidate) => candidate.id !== day.id)
    .map((candidate) => ({ id: candidate.id, label: formatDateWithWeekday(candidate.localDate) }));

  const panel = (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="เริ่มวันเวลา">
            <TextInput
              type="time"
              value={day.startLocalTime.slice(0, 5)}
              disabled={pending}
              onChange={(event) =>
                run(() =>
                  updateItineraryDayAction({
                    tripId,
                    dayId: day.id,
                    startLocalTime: event.target.value,
                    expectedVersion: day.version,
                  }),
                )
              }
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
        pickingOnMap={pickingOnMap}
        pickedCoordinates={picked}
        onTogglePickOnMap={(next) => {
          setPickingOnMap(next);
          if (next) switchMobileView('map');
        }}
        onAdd={addStop}
      />

      {stops.length === 0 ? (
        <EmptyState
          icon={<Plus className="size-8" />}
          title="ยังไม่มีสถานที่ในวันนี้"
          description="ค้นหาสถานที่ หรือปักหมุดบนแผนที่เพื่อเริ่มวางแผน"
        />
      ) : (
        <ol className="space-y-1">
          {stops.map((stop, index) => {
            const legBefore = legs.find((leg) => leg.destinationStopId === stop.id);
            const legOrigin = legBefore ? stopById.get(legBefore.originStopId) : undefined;

            return (
              <li key={stop.id}>
                {legBefore && legOrigin ? (
                  <ol>
                    <LegRow
                      legKey={legBefore.legKey}
                      color={colorByLegKey.get(legBefore.legKey) ?? legColor(0)}
                      originName={legOrigin.name}
                      destinationName={stop.name}
                      mode={legBefore.transportMode}
                      fromStoredPreference={legBefore.fromStoredPreference}
                      manualDurationMinutes={legBefore.manualDurationMinutes}
                      visibleOnMap={legBefore.visibleOnMap}
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
                      onToggleVisible={(next) =>
                        saveLeg(legBefore.originStopId, legBefore.destinationStopId, {
                          visibleOnMap: next,
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
                    isLast={index === stops.length - 1}
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
                    onDragStart={() => setDragKey(stop.id)}
                    onDragOver={() => setDropKey(stop.id)}
                    onDrop={() => dropOnto(stop.id)}
                    dragging={dragKey === stop.id || dropKey === stop.id}
                  />
                </ol>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  const map = (
    <MapView
      stops={mapStops}
      legs={mapLegs}
      selectedStopId={selectedStopId}
      selectedLegKey={selectedLegKey}
      onSelectStop={(stopId) => {
        setSelectedStopId(stopId);
        setSelectedLegKey(null);
        if (mobileView === 'map') setDetailSheetOpen(true);
      }}
      onSelectLeg={(key) => {
        setSelectedLegKey(key);
        setSelectedStopId(null);
      }}
      onPickCoordinates={
        pickingOnMap
          ? (latitude, longitude) => {
              setPicked({ latitude, longitude });
              setPickingOnMap(false);
              switchMobileView('list');
            }
          : null
      }
      attributions={attributions}
      showApproximateConnectors={showApproximate}
      onToggleApproximateConnectors={setShowApproximate}
      onToggleLegVisible={(key, next) => {
        const leg = legs.find((candidate) => candidate.legKey === key);
        if (leg) saveLeg(leg.originStopId, leg.destinationStopId, { visibleOnMap: next });
      }}
    />
  );

  return (
    <div className="space-y-3">
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

      {/* Mobile view switch; both panes stay mounted so state and scroll survive. */}
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 lg:hidden">
        {(
          [
            { key: 'list' as const, label: 'รายการ', icon: List },
            { key: 'map' as const, label: 'แผนที่', icon: MapIcon },
          ]
        ).map((view) => (
          <button
            key={view.key}
            type="button"
            onClick={() => switchMobileView(view.key)}
            aria-pressed={mobileView === view.key}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold ${
              mobileView === view.key ? 'bg-brand text-white' : 'text-ink'
            }`}
          >
            <view.icon aria-hidden className="size-4" />
            {view.label}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-4">
        <div
          ref={listRef}
          className={`${mobileView === 'list' ? '' : 'hidden'} lg:block lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto lg:pr-1`}
        >
          {panel}
        </div>

        {/* The map keeps its own height and stays put while the panel scrolls. */}
        <div
          className={`${mobileView === 'map' ? '' : 'hidden'} h-[calc(100dvh-16rem)] lg:sticky lg:top-4 lg:block lg:h-[calc(100dvh-13rem)]`}
        >
          {map}
        </div>
      </div>

      {/* Compact stop detail on phones, so the map stays visible behind it. */}
      <Sheet
        open={detailSheetOpen && mobileView === 'map' && selectedStop !== null}
        onClose={() => setDetailSheetOpen(false)}
        title={selectedStop?.name ?? ''}
        description={selectedStop?.address ?? undefined}
      >
        {selectedStop ? (
          <div className="space-y-2 text-sm">
            <p className="text-ink-soft">
              {selectedStop.enabled
                ? stopTiming.get(selectedStop.id)?.incomplete
                  ? 'เวลายังคำนวณไม่ได้'
                  : `ถึง ${formatClock(
                      stopTiming.get(selectedStop.id)?.arrivalMinutes,
                    )} · ออก ${formatClock(stopTiming.get(selectedStop.id)?.departureMinutes)}`
                : 'ไม่รวมในแผน'}
            </p>
            <p className="text-ink-soft">
              อยู่ที่นี่ {formatDuration(selectedStop.visitDurationMinutes)}
            </p>
            {selectedStop.notes ? (
              <p className="whitespace-pre-wrap text-ink-soft">{selectedStop.notes}</p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setDetailSheetOpen(false);
                switchMobileView('list');
              }}
            >
              แก้ไขในรายการ
            </Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
