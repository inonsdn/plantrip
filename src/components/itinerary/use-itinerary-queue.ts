'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import type { ActionResult } from '@/lib/actions/result';
import type { ItineraryDayView } from '@/lib/itinerary/types';

export interface ItineraryTask {
  /** Named in the toast when this task is the one the server refuses. */
  label: string;
  /**
   * The days whose `version` this task increments. `bump_itinerary_day` adds
   * exactly one each time, so counting our own bumps keeps the next task's
   * expected version right — and leaves it wrong, deliberately, if somebody
   * else edited in between, which is what the check is for.
   */
  bumps: readonly string[];
  /** The day whose version this task is checked against, if any. */
  dayId: string | null;
  /** What the change looks like before the server has been asked. */
  apply: (days: readonly ItineraryDayView[]) => ItineraryDayView[];
  run: (expectedVersion: number | null) => Promise<ActionResult<unknown>>;
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

    // Local to this batch: how many times we have bumped each day ourselves.
    const bumps = new Map<string, number>();

    try {
      while (pending.current.length > 0) {
        const task = pending.current[0];

        const serverVersion = task.dayId
          ? (latest.current.serverDays.find((day) => day.id === task.dayId)?.version ?? null)
          : null;
        const expected =
          serverVersion === null ? null : serverVersion + (bumps.get(task.dayId!) ?? 0);

        const result = await task.run(expected);

        if (!result.ok) {
          // Everything queued behind this was built on a state that never
          // happened, so none of it can be sent.
          pending.current = [];
          setQueued([]);
          setAccepted([]);
          latest.current.showToast({
            message: `${task.label}ไม่สำเร็จ · ${result.error}`,
            tone: 'error',
            // The task carries everything it needs, so a retry runs it again
            // — against whatever the refresh below brings back, which is the
            // point when the failure was a version conflict.
            action: { label: 'ลองใหม่', onClick: () => enqueueRef.current(task) },
          });
          // The server did not change, so nothing revalidated: ask for the
          // truth explicitly before drawing it again.
          latest.current.router.refresh();
          return;
        }

        for (const dayId of task.bumps) bumps.set(dayId, (bumps.get(dayId) ?? 0) + 1);
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
      pending.current = [...pending.current, task];
      setQueued([...pending.current]);
      void drain();
    },
    [drain],
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
  };
}
