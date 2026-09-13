'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, MapPin, MoonStar, Pencil, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/sheet';
import { useTripUi } from '@/components/trip/trip-shell';
import { formatDateWithWeekday } from '@/lib/format';
import { resolveLegs, type StoredLegPreference } from '@/lib/itinerary/legs';
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
import type { ItineraryDayView } from '@/lib/itinerary/types';
import {
  addItineraryStopAction,
  deleteItineraryStopAction,
  moveItineraryStopAction,
  reorderItineraryStopsAction,
  restoreItineraryStopAction,
  saveItineraryStopAction,
  updateItineraryDayAction,
} from '@/lib/actions/itinerary';
import type { ActionResult } from '@/lib/actions/result';
import { AddStopForm, type NewStopInput } from './add-stop';
import { DayDialog, timeZoneLabel, type DayDraft } from './day-dialog';
import { StopCard } from './stop-card';
import { StopDialog, type LegDraft, type StopDraft } from './stop-dialog';
import { useLegRoutes, type LegRouteRequest } from './use-routing';
import { useReorder } from './use-reorder';

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
  const [addOpen, setAddOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

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
        notBeforeMinutes: parseLocalTime(stop.notBeforeLocalTime),
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

  const run = useCallback(
    (
      action: () => Promise<ActionResult<unknown>>,
      options?: { success?: string; onSuccess?: () => void; onError?: (message: string) => void },
    ) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          if (options?.onError) options.onError(result.error);
          else showToast({ message: result.error, tone: 'error' });
          // Someone else's change may already be live; reload so the panel
          // shows it and a retry is made against the current version.
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

  function addStop(input: NewStopInput) {
    if (!day) return;
    run(
      () =>
        addItineraryStopAction({ tripId, dayId: day.id, expectedVersion: day.version, ...input }),
      { success: 'เพิ่มสถานที่แล้ว', onSuccess: () => setAddOpen(false) },
    );
  }

  function saveDay(draft: DayDraft) {
    if (!day) return;
    setDialogError(null);
    run(
      () =>
        updateItineraryDayAction({
          tripId,
          dayId: day.id,
          startLocalTime: draft.startLocalTime,
          timeZone: draft.timeZone,
          defaultTransportMode: draft.defaultTransportMode,
          expectedVersion: day.version,
        }),
      { onSuccess: () => setDayOpen(false), onError: setDialogError },
    );
  }

  function saveStop(stopId: string, stopDraft: StopDraft, legDraft: LegDraft | null) {
    if (!day) return;
    setDialogError(null);
    run(
      () =>
        saveItineraryStopAction({
          tripId,
          stopId,
          expectedVersion: day.version,
          stop: stopDraft,
          leg: legDraft
            ? {
                destinationStopId: legDraft.destinationStopId,
                transportMode: legDraft.transportMode,
                manualDurationMinutes: legDraft.manualDurationMinutes,
                notes: legDraft.notes,
              }
            : null,
        }),
      { onSuccess: () => setEditingStopId(null), onError: setDialogError },
    );
  }

  function deleteStop(stopId: string) {
    run(() => deleteItineraryStopAction(tripId, stopId), {
      onSuccess: () => {
        setEditingStopId(null);
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
      onError: setDialogError,
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
        onClick={() => {
          setDialogError(null);
          setDayOpen(true);
        }}
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
            {schedule.totals.complete ? formatDuration(schedule.totals.travelMinutes) : '—'}
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
                busy={pending}
                onOpen={() => {
                  setDialogError(null);
                  setEditingStopId(stop.id);
                }}
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
          <AddStopForm
            tripId={tripId}
            searchEnabled={routingConfigured}
            busy={pending}
            onAdd={addStop}
          />
        ) : null}
      </Sheet>

      {dayOpen ? (
        <DayDialog
          // Remounts on a saved change so the draft starts from the new values.
          key={`${day.id}:${day.version}`}
          open
          day={day}
          title={formatDateWithWeekday(day.localDate)}
          busy={pending}
          error={dialogError}
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
          busy={pending}
          error={dialogError}
          onClose={() => setEditingStopId(null)}
          onConfirm={(stopDraft, legDraft) => saveStop(editingStop.id, stopDraft, legDraft)}
          onDelete={() => deleteStop(editingStop.id)}
          onMoveToDay={(dayId) =>
            run(() => moveItineraryStopAction(tripId, editingStop.id, dayId), {
              success: 'ย้ายสถานที่แล้ว',
              onSuccess: () => setEditingStopId(null),
              onError: setDialogError,
            })
          }
          onRecordExpense={(legDraft) =>
            recordLegExpense(editingStop.name, editingStop.id, legDraft)
          }
        />
      ) : null}
    </div>
  );
}
