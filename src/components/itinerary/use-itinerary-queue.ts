'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import type { ActionResult } from '@/lib/actions/result';
import {
  expectedVersion,
  noteFailure,
  recordVersion,
  shouldStop,
  type KnownVersions,
} from '@/lib/itinerary/queue-policy';
import type { ItineraryDayView } from '@/lib/itinerary/types';

export interface ItineraryTask {
  /** Named in the toast when this task is the one the server refuses. */
  label: string;
  /** The day whose version this task is checked against, if any. */
  dayId: string | null;
  /**
   * Days this task changes the version of without reporting the new number.
   * The next task touching one of them sends no expected version rather than
   * an invented one.
   */
  invalidates?: readonly string[];
  /** What the change looks like before the server has been asked. */
  apply: (days: readonly ItineraryDayView[]) => ItineraryDayView[];
  /**
   * Runs the change. The result carries the day's new `version` whenever the
   * action bumped exactly one day, which is what the next task is checked
   * against.
   */
  run: (
    expectedVersion: number | null,
  ) => Promise<ActionResult<{ version?: number | null } | undefined>>;
}

/**
 * Optimistic itinerary edits, applied in order, one request at a time.
 *
 * The change appears immediately and stays on screen until the server either
 * confirms it — its own revalidation brings the real data back, with no extra
 * round trip — or refuses, at which point the whole batch is dropped, the list
 * snaps back to what the server actually holds, and a toast says what failed.
 *
 * Requests are strictly serial. They all bump the same day's version, so
 * sending two at once would make the second one's expected version stale and
 * the server would reject an edit that was never in conflict with anything.
 */
export function useItineraryQueue(serverDays: ItineraryDayView[]) {
  const router = useRouter();
  const { showToast } = useToast();

  // Tasks still to run, and tasks the server has accepted but whose data has
  // not come back yet. Both stay on screen; together they are the overlay.
  const [queued, setQueued] = useState<ItineraryTask[]>([]);
  const [accepted, setAccepted] = useState<ItineraryTask[]>([]);

  const pending = useRef<ItineraryTask[]>([]);
  const running = useRef(false);
  const failures = useRef<number[]>([]);
  const [halted, setHalted] = useState(false);
  const latest = useRef({ serverDays, router, showToast });

  useEffect(() => {
    latest.current = { serverDays, router, showToast };
  });

  // Any change the server sends supersedes what we were drawing on top of it.
  // Every itinerary mutation either bumps a day's version or adds/removes a
  // stop, so this signature always moves when one of ours lands.
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

  // The retry offered on failure re-enters the queue, which is defined below.
  const enqueueRef = useRef<(task: ItineraryTask) => void>(() => {});

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    // What the server last told us each day's version is. Seeded from the page
    // we are looking at, then replaced by the number the server returns from
    // each change — never by arithmetic. Counting our own bumps and adding them
    // to the last render raced the revalidation carrying those same bumps, and
    // every wrong guess came back as 40001 for an edit that conflicted with
    // nothing at all.
    const known: KnownVersions = new Map();

    try {
      while (pending.current.length > 0) {
        const task = pending.current[0];

        const expected = expectedVersion(
          task.dayId,
          known,
          (dayId) => latest.current.serverDays.find((day) => day.id === dayId)?.version ?? null,
        );

        const result = await task.run(expected);

        if (!result.ok) {
          // Everything queued behind this was built on a state that never
          // happened, so none of it can be sent.
          pending.current = [];
          setQueued([]);
          setAccepted([]);

          failures.current = noteFailure(failures.current, Date.now());
          const givingUp = shouldStop(failures.current);
          if (givingUp) setHalted(true);

          latest.current.showToast({
            message: givingUp
              ? `${task.label}ไม่สำเร็จซ้ำหลายครั้ง · หยุดบันทึกไว้ก่อน กรุณาโหลดหน้านี้ใหม่`
              : `${task.label}ไม่สำเร็จ · ${result.error}`,
            tone: 'error',
            // Retrying is offered only while retrying can still plausibly work.
            // The task carries everything it needs, so it runs again against
            // whatever the refresh below brings back.
            action: givingUp
              ? { label: 'โหลดใหม่', onClick: () => window.location.reload() }
              : { label: 'ลองใหม่', onClick: () => enqueueRef.current(task) },
          });
          // The server did not change, so nothing revalidated: ask for the
          // truth explicitly before drawing it again.
          latest.current.router.refresh();
          return;
        }

        // A run that landed clears the streak: this tab and the server agree.
        failures.current = [];

        recordVersion(known, task.dayId, result.data?.version, task.invalidates);

        pending.current = pending.current.slice(1);
        setQueued([...pending.current]);
        setAccepted((current) => [...current, task]);
      }
    } finally {
      running.current = false;
    }
  }, []);

  const enqueue = useCallback(
    (task: ItineraryTask) => {
      // Once the queue has given up, nothing else is sent until the page is
      // reloaded. This is the backstop: whatever starts a loop, it stops here.
      if (halted) return;
      pending.current = [...pending.current, task];
      setQueued([...pending.current]);
      void drain();
    },
    [drain, halted],
  );

  useEffect(() => {
    enqueueRef.current = enqueue;
  }, [enqueue]);

  const days = useMemo(() => {
    if (accepted.length === 0 && queued.length === 0) return serverDays;
    let next: readonly ItineraryDayView[] = serverDays;
    for (const task of [...accepted, ...queued]) next = task.apply(next);
    return [...next];
  }, [serverDays, accepted, queued]);

  return {
    /** The server's days with every unconfirmed change of ours drawn on top. */
    days,
    enqueue,
    /** True while anything of ours is still in flight. */
    saving: queued.length > 0,
    /** True once the queue has stopped sending; only a reload clears it. */
    halted,
  };
}
