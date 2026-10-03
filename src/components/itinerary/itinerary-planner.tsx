'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, MoonStar, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/sheet';
import { useTripUi } from '@/components/trip/trip-shell';
import { formatDateWithWeekday } from '@/lib/format';
import { resolveLegs, type StoredLegPreference } from '@/lib/itinerary/legs';
import type { ItineraryStopView } from '@/lib/itinerary/types';
import { uuid } from '@/lib/uuid';
import {
  computeDaySchedule,
  formatClock,
  formatDuration,
  legKey as makeLegKey,
  parseLocalTime,
  splitClock,
  type LegTravel,
} from '@/lib/itinerary/schedule';
import type { RouteAlternative } from '@/lib/itinerary/providers/types';
import type { SharePlanInput } from '@/lib/itinerary/share-plan';
import type { ItineraryDayView } from '@/lib/itinerary/types';
import { AddStopForm, type NewStopInput } from './add-stop';
import { DayDialog, timeZoneLabel, type DayDraft } from './day-dialog';
import { SharePlanButton } from './share-plan-button';
import { StopCard } from './stop-card';
import { StopDialog, type LegDraft, type StopDraft } from './stop-dialog';
import { useItineraryQueue } from './use-itinerary-queue';
import { useLegRoutes, type LegRouteRequest } from './use-routing';
import { useReorder } from './use-reorder';

export function ItineraryPlanner({
  tripId,
  days: serverDays,
  routingConfigured,
}: {
  tripId: string;
  days: ItineraryDayView[];
  /** False when no routing provider is set up: times are entered by hand. */
  routingConfigured: boolean;
}) {
  const { showToast } = useToast();
  const { context, openExpense, reportPendingChanges } = useTripUi();

  // List edits land on screen at once and are reconciled in the background;
  // the dialogs below still wait for their own confirmation.
  const { days, submit, pendingCount, halted } = useItineraryQueue(tripId, serverDays);

  // The header shows the spinner: it is always on screen, and putting it there
  // keeps every control in the list untouched while a save is in flight.
  useEffect(() => {
    reportPendingChanges(pendingCount);
    return () => reportPendingChanges(0);
  }, [pendingCount, reportPendingChanges]);

  const [selectedDayId, setSelectedDayId] = useState<string | null>(days[0]?.id ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);

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
        notes: preference.notes,
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
        arrivalMinutes: parseLocalTime(stop.arrivalLocalTime),
        departureMinutes: parseLocalTime(stop.departureLocalTime),
        enabled: stop.enabled,
      })),
    [stops],
  );

  const provisional = useMemo(
    () =>
      computeDaySchedule({ startMinutes, stops: scheduleInputStops, travelByLegKey: manualTravel }),
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
      table.set(
        leg.legKey,
        result?.alternatives.find(
          (alternative) => alternative.reference === leg.selectedRouteReference,
        ) ??
          result?.alternatives[0] ??
          null,
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

  // ---------------------------------------------------------------------
  // mutations
  // ---------------------------------------------------------------------

  // Stable, so the drag's window listeners are not torn down and re-added on
  // every frame of the drag.
  const reorder = useCallback(
    (stopIds: string[]) => {
      if (!day) return;
      submit({ kind: 'reorder', dayId: day.id, stopIds });
    },
    [day, submit],
  );

  function addStop(input: NewStopInput) {
    if (!day) return;
    setAddOpen(false);
    // The id is chosen here and travels with the change: it is what the list
    // draws now, what the database stores, and what makes a replay of this add
    // collide with itself rather than create the place twice.
    const stop: ItineraryStopView = {
      id: uuid(),
      dayId: day.id,
      position: Number.MAX_SAFE_INTEGER,
      placeProvider: input.placeProvider,
      placeId: input.placeId,
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      visitDurationMinutes: input.visitDurationMinutes,
      arrivalLocalTime: input.arrivalLocalTime,
      departureLocalTime: input.departureLocalTime,
      enabled: true,
      notes: null,
    };
    submit({ kind: 'addStop', dayId: day.id, stop });
  }

  function saveDay(draft: DayDraft) {
    if (!day) return;
    setDayOpen(false);
    submit({ kind: 'saveDay', dayId: day.id, day: draft });
  }

  function saveStop(stopId: string, stopDraft: StopDraft, legDraft: LegDraft | null) {
    if (!day) return;
    setEditingStopId(null);
    submit({
      kind: 'saveStop',
      dayId: day.id,
      stopId,
      stop: stopDraft,
      leg: legDraft
        ? {
            destinationStopId: legDraft.destinationStopId,
            transportMode: legDraft.transportMode,
            manualDurationMinutes: legDraft.manualDurationMinutes,
            notes: legDraft.notes,
          }
        : null,
    });
  }

  function deleteStop(stopId: string) {
    const removed = stopById.get(stopId);
    const dayId = day?.id ?? null;
    setEditingStopId(null);

    submit({ kind: 'deleteStop', stopId });

    showToast({
      message: 'ลบสถานที่แล้ว',
      tone: 'info',
      action: {
        label: 'เลิกทำ',
        onClick: () => {
          if (!removed || !dayId) return;
          // The row is still in the database, soft deleted, so putting it back
          // on screen is honest while the restore is in flight.
          submit({ kind: 'restoreStop', dayId, stop: removed });
        },
      },
    });
  }

  function recordLegExpense(originName: string, stopId: string, legDraft: LegDraft) {
    if (!day) return;
    setEditingStopId(null);
    openExpense(null, {
      description: `เดินทาง: ${originName} → ${legDraft.destinationName}`,
      category: 'transport',
      expenseDate: day.localDate,
      itinerary: {
        dayId: day.id,
        originStopId: stopId,
        destinationStopId: legDraft.destinationStopId,
      },
    });
  }

  const stopIds = useMemo(() => stops.map((stop) => stop.id), [stops]);
  const drag = useReorder(stopIds, reorder);

  // ---------------------------------------------------------------------
  // the shareable picture
  // ---------------------------------------------------------------------

  // It covers every day, but a provider is only asked about the day on screen.
  // Travel times somebody typed are known for all of them, so the other days
  // are drawn from those and leave the rest blank rather than inventing it.
  // An orphaned preference — a pair that is no longer adjacent — is harmless
  // here: the schedule only ever looks up the legs it builds itself.
  const shareTravel = useMemo<Record<string, LegTravel>>(() => {
    const table: Record<string, LegTravel> = {};
    for (const candidate of days) {
      for (const preference of candidate.legPreferences) {
        if (preference.manualDurationMinutes === null) continue;
        table[makeLegKey(preference.originStopId, preference.destinationStopId)] = {
          minutes: preference.manualDurationMinutes,
          source: 'manual',
        };
      }
    }
    // The open day's resolved routes win, so the picture agrees with the list.
    return { ...table, ...travelByLegKey };
  }, [days, travelByLegKey]);

  const shareInput = useMemo<SharePlanInput>(
    () => ({
      tripName: context.trip.name,
      destination: context.trip.destination,
      startDate: context.trip.startDate,
      endDate: context.trip.endDate,
      memberCount: context.members.length,
      days,
      travelByLegKey: shareTravel,
    }),
    [context, days, shareTravel],
  );

  if (days.length === 0 || !day) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-8" />}
        title="ยังไม่มีวันในแผนการเดินทาง"
        description="กำหนดวันเริ่มต้นและวันสิ้นสุดของทริป แล้วกลับมาที่หน้านี้อีกครั้ง"
      />
    );
  }

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

  const editingStop = editingStopId ? stopById.get(editingStopId) ?? null : null;
  const editingLeg = editingStop
    ? (legs.find((leg) => leg.originStopId === editingStop.id) ?? null)
    : null;
  const editingLegDraft: LegDraft | null = editingLeg
    ? {
        destinationStopId: editingLeg.destinationStopId,
        destinationName: stopById.get(editingLeg.destinationStopId)?.name ?? '',
        transportMode: editingLeg.transportMode,
        manualDurationMinutes: editingLeg.manualDurationMinutes,
        notes: editingLeg.notes,
      }
    : null;

  const crossesMidnight =
    schedule.endMinutes !== null && splitClock(schedule.endMinutes).dayOffset > 0;

  return (
    // A list reads badly at full desktop width, so it keeps a column.
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="flex justify-end">
        <SharePlanButton input={shareInput} />
      </div>

      {/* Day selector: a horizontal strip so long trips stay one row. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {days.map((candidate, index) => {
            const active = candidate.id === day.id;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDayId(candidate.id)}
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

      {/* The day, in two lines. Everything editable is behind the dialog. */}
      <button
        type="button"
        onClick={() => setDayOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left hover:bg-canvas/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">
            <span className="text-muted">เริ่มวัน</span>{' '}
            <span className="font-semibold">{formatClock(schedule.startMinutes)}</span>
            <span className="text-muted"> · {timeZoneLabel(day.timeZone)}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-soft">
            <span className="text-muted">รวมทั้งวัน</span>{' '}
            <span className="font-medium text-ink">
              {schedule.totals.elapsedMinutes === null
                ? '—'
                : formatDuration(schedule.totals.elapsedMinutes)}
            </span>
            <span className="text-muted"> · เดินทาง</span>{' '}
            {formatDuration(schedule.totals.travelMinutes)}
            <span className="text-muted"> · เที่ยว</span>{' '}
            {formatDuration(schedule.totals.visitMinutes)}
            {crossesMidnight ? (
              <>
                {' · '}
                <MoonStar aria-hidden className="inline size-3 align-[-1px] text-brand" />{' '}
                <span className="text-brand-strong">ข้ามเที่ยงคืน</span>
              </>
            ) : null}
          </span>
        </span>
        <Pencil aria-hidden className="size-4 shrink-0 text-muted" />
      </button>

      {halted ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-negative/30 bg-negative-soft px-4 py-3"
        >
          <p className="text-sm leading-6 text-ink">
            หยุดบันทึกไว้ชั่วคราว เพราะเซิร์ฟเวอร์ปฏิเสธการแก้ไขซ้ำหลายครั้ง
            <span className="mt-0.5 block text-xs text-ink-soft">
              การแก้ไขหลังจากนี้จะไม่ถูกบันทึกจนกว่าจะโหลดหน้านี้ใหม่
            </span>
          </p>
          <Button type="button" size="sm" onClick={() => window.location.reload()}>
            โหลดหน้าใหม่
          </Button>
        </div>
      ) : null}


      {stops.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-8" />}
          title="ยังไม่มีสถานที่ในวันนี้"
          description="กดปุ่ม เพิ่มสถานที่ มุมขวาล่าง แล้วลากการ์ดเพื่อจัดลำดับได้"
        />
      ) : (
        <ol className="space-y-1.5">
          {drag.order.map((stopId) => {
            const stop = stopById.get(stopId);
            if (!stop) return null;
            return (
              <StopCard
                key={stop.id}
                stop={stop}
                order={orderByStopId.get(stop.id) ?? null}
                timing={stopTiming.get(stop.id)}
                onOpen={() => setEditingStopId(stop.id)}
                onGripPointerDown={(event) => drag.start(stop.id, event)}
                registerElement={(element) => drag.register(stop.id, element)}
                dragging={drag.draggingId === stop.id}
              />
            );
          })}
        </ol>
      )}

      {/* Replaces the trip-wide add-expense button while this tab is open. */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-brand px-5 text-base font-semibold text-white shadow-lg shadow-ink/20 transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong sm:bottom-6"
      >
        <Plus aria-hidden className="size-5" />
        เพิ่มสถานที่
      </button>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="เพิ่มสถานที่"
        description={formatDateWithWeekday(day.localDate)}
        size="lg"
      >
        {addOpen ? (
          <AddStopForm tripId={tripId} searchEnabled={routingConfigured} onAdd={addStop} />
        ) : null}
      </Sheet>

      {dayOpen ? (
        <DayDialog
          // Remounts on a saved change so the draft starts from the new values.
          key={`${day.id}:${day.version}`}
          open
          day={day}
          title={formatDateWithWeekday(day.localDate)}
          onClose={() => setDayOpen(false)}
          onConfirm={saveDay}
        />
      ) : null}

      {editingStop ? (
        <StopDialog
          key={`${editingStop.id}:${day.version}`}
          open
          stop={editingStop}
          order={orderByStopId.get(editingStop.id) ?? null}
          timing={stopTiming.get(editingStop.id)}
          leg={editingLegDraft}
          otherDays={otherDays}
          onClose={() => setEditingStopId(null)}
          onConfirm={(stopDraft, legDraft) => saveStop(editingStop.id, stopDraft, legDraft)}
          onDelete={() => deleteStop(editingStop.id)}
          onMoveToDay={(targetDayId) => {
            const stopId = editingStop.id;
            setEditingStopId(null);
            submit({ kind: 'moveStop', stopId, fromDayId: day.id, toDayId: targetDayId });
            showToast({ message: 'ย้ายสถานที่แล้ว', tone: 'success' });
          }}
          onRecordExpense={(legDraft) =>
            recordLegExpense(editingStop.name, editingStop.id, legDraft)
          }
        />
      ) : null}
    </div>
  );
}
