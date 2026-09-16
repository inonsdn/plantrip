'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import {
  applyOperation,
  checkedAgainstDay,
  describeOperation,
  versionsInvalidatedBy,
  type ItineraryOperation,
  type QueuedChange,
} from '@/lib/itinerary/operations';
import {
  expectedVersion,
  noteFailure,
  recordVersion,
  shouldStop,
  type KnownVersions,
} from '@/lib/itinerary/queue-policy';
import { loadQueue, saveQueue } from '@/lib/itinerary/queue-storage';
import type { ItineraryDayView } from '@/lib/itinerary/types';
import { runOperation } from './run-operation';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Only reached on a browser without randomUUID; uniqueness within one tab is
  // all this needs, since it never becomes a database key on that path.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Optimistic itinerary edits, applied in order, one request at a time.
 *
 * Each change carries an id for its whole life, so the queue settles them one
 * by one: the one that succeeded leaves the queue, the one that was refused is
 * rolled back on its own and named in a toast, and everything else keeps going.
 * A batch is never thrown away wholesale any more.
 *
 * The queue is written to browser storage while anything is unsent, so closing
 * the app mid-save does not lose the change: it is picked up and pushed when
 * the trip is opened again. Every operation is idempotent, which is what makes
 * replaying a change that may already have landed safe.
 *
 * Requests are strictly serial. They all bump the same day's version, so
 * sending two at once would make the second one's expected version stale.
 */
export function useItineraryQueue(tripId: string, serverDays: ItineraryDayView[]) {
  const router = useRouter();
  const { showToast } = useToast();

  // Changes still to send, and changes the server has taken but whose data has
  // not come back yet. Both stay on screen; together they are the overlay.
  const [queued, setQueued] = useState<QueuedChange[]>([]);
  const [accepted, setAccepted] = useState<QueuedChange[]>([]);
  const [halted, setHalted] = useState(false);

  const pending = useRef<QueuedChange[]>([]);
  const running = useRef(false);
  const failures = useRef<number[]>([]);
  // Lives as long as this planner does, not as long as one batch. The server's
  // answer has to survive the queue going idle, or the next edit falls back to
  // the page — which is a version behind until its revalidation lands.
  const known = useRef<KnownVersions>(new Map());
  const latest = useRef({ serverDays, router, showToast });

  useEffect(() => {
    latest.current = { serverDays, router, showToast };
  });

  // Any change the server sends supersedes what we were drawing on top of it.
  const signature = useMemo(
    () =>
      serverDays
        .map((day) => `${day.id}:${day.version}:${day.stops.map((stop) => stop.id).join(',')}`)
        .join('|'),
    [serverDays],
  );
  const [lastSignature, setLastSignature] = useState(signature);
  if (lastSignature !== signature) {
    setLastSignature(signature);
    setAccepted([]);
  }

  /** Keeps the written-down queue in step with the one in memory. */
  const publish = useCallback(() => {
    setQueued([...pending.current]);
    saveQueue(tripId, pending.current);
  }, [tripId]);

  const enqueueRef = useRef<(change: QueuedChange) => void>(() => {});

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    try {
      while (pending.current.length > 0) {
        const change = pending.current[0];
        const label = describeOperation(change.operation);
        const dayId = checkedAgainstDay(change.operation);

        // A replayed change cannot be checked against a version: whatever we
        // remembered before the app closed says nothing about now.
        const expected = change.resumed
          ? null
          : expectedVersion(
              dayId,
              known.current,
              (id) => latest.current.serverDays.find((day) => day.id === id)?.version ?? null,
            );

        const result = await runOperation(change.tripId, change.operation, expected);

        // Settled either way: this change leaves the queue on its own, and the
        // ones behind it are untouched.
        pending.current = pending.current.filter((entry) => entry.id !== change.id);

        if (!result.ok) {
          // Rolling back is simply not drawing this one any more. Nothing else
          // on screen moves, and nothing takes focus — a refused save must not
          // interrupt whatever is being typed next.
          publish();

          failures.current = noteFailure(failures.current, Date.now());
          const givingUp = shouldStop(failures.current);
          if (givingUp) {
            setHalted(true);
            pending.current = [];
            publish();
          }

          latest.current.showToast({
            message: givingUp
              ? `${label}ไม่สำเร็จซ้ำหลายครั้ง · หยุดบันทึกไว้ก่อน กรุณาโหลดหน้านี้ใหม่`
              : `${label}ไม่สำเร็จ · ${result.error}`,
            tone: 'error',
            action: givingUp
              ? { label: 'โหลดใหม่', onClick: () => window.location.reload() }
              : {
                  label: 'ลองใหม่',
                  onClick: () => enqueueRef.current({ ...change, id: newId(), resumed: true }),
                },
          });
          // Out of step with the server: forget what we thought we knew and
          // start again from whatever the refresh brings back.
          known.current = new Map();
          latest.current.router.refresh();
          continue;
        }

        // A run that landed clears the streak: this tab and the server agree.
        failures.current = [];
        recordVersion(
          known.current,
          dayId,
          result.data?.version,
          versionsInvalidatedBy(change.operation),
        );

        publish();
        setAccepted((current) => [...current, change]);
      }
    } finally {
      running.current = false;
    }
  }, [publish]);

  const enqueue = useCallback(
    (change: QueuedChange) => {
      // Once the queue has given up, nothing else is sent until the page is
      // reloaded. It must never be quiet about it: dropping the change in
      // silence is what a save that "just does not happen" looks like.
      if (halted) {
        latest.current.showToast({
          message: `${describeOperation(change.operation)}ไม่ถูกบันทึก · หยุดบันทึกไว้เพราะเซิร์ฟเวอร์ปฏิเสธซ้ำหลายครั้ง กรุณาโหลดหน้านี้ใหม่`,
          tone: 'error',
          action: { label: 'โหลดใหม่', onClick: () => window.location.reload() },
        });
        return;
      }
      pending.current = [...pending.current, change];
      publish();
      void drain();
    },
    [drain, halted, publish],
  );

  useEffect(() => {
    enqueueRef.current = enqueue;
  }, [enqueue]);

  /** Starts a change from an operation, giving it the id it keeps for life. */
  const submit = useCallback(
    (operation: ItineraryOperation) => {
      enqueueRef.current({ id: newId(), tripId, operation, queuedAt: Date.now() });
    },
    [tripId],
  );

  // Anything left unsent when the app was closed is picked up here, once.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;

    const waiting = loadQueue(tripId);
    if (waiting.length === 0) return;

    pending.current = [...waiting, ...pending.current];
    setQueued([...pending.current]);
    showToast({
      message: `กำลังบันทึกการแก้ไข ${waiting.length} รายการที่ค้างไว้`,
      tone: 'info',
    });
    void drain();
  }, [tripId, drain, showToast]);

  const days = useMemo(() => {
    if (accepted.length === 0 && queued.length === 0) return serverDays;
    let next: readonly ItineraryDayView[] = serverDays;
    for (const change of [...accepted, ...queued]) next = applyOperation(next, change.operation);
    return [...next];
  }, [serverDays, accepted, queued]);

  return {
    /** The server's days with every unconfirmed change of ours drawn on top. */
    days,
    submit,
    /** How many changes are still on their way to the server. */
    pendingCount: queued.length,
    /** True once the queue has stopped sending; only a reload clears it. */
    halted,
  };
}
