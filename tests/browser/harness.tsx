import { useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { useItineraryQueue } from '@/components/itinerary/use-itinerary-queue';
import type { ItineraryOperation } from '@/lib/itinerary/operations';
import type { ItineraryDayView, ItineraryStopView } from '@/lib/itinerary/types';

export const TRIP_ID = '11111111-1111-1111-1111-111111111111';
export const DAY_ID = '22222222-2222-2222-2222-222222222222';

export function stop(id: string, name = id.toUpperCase(), position = 0): ItineraryStopView {
  return {
    id,
    dayId: DAY_ID,
    position,
    placeProvider: 'manual',
    placeId: null,
    name,
    address: null,
    latitude: null,
    longitude: null,
    visitDurationMinutes: 30,
    arrivalLocalTime: null,
    departureLocalTime: null,
    enabled: true,
    notes: null,
  };
}

export function day(version: number, stops: ItineraryStopView[]): ItineraryDayView {
  return {
    id: DAY_ID,
    tripId: TRIP_ID,
    localDate: '2026-12-04',
    startLocalTime: '09:00',
    timeZone: 'Asia/Tokyo',
    defaultTransportMode: 'transit',
    version,
    stops,
    legPreferences: [],
  };
}

/** What the fake server was asked, in order. */
export interface Call {
  operation: ItineraryOperation;
  expectedVersion: number | null;
  settle: (result: { ok: true; version: number } | { ok: false; error: string }) => void;
}

/**
 * The planner, reduced to what the queue touches: the list it draws, a field to
 * type into, and a way to start a change. Everything else — the hook, the toast
 * provider, the storage, the focus — is the real thing.
 */
function Harness({
  serverDays,
  onReady,
}: {
  serverDays: ItineraryDayView[];
  onReady: (api: { submit: (operation: ItineraryOperation) => void }) => void;
}) {
  const { days, submit, pendingCount, halted } = useItineraryQueue(TRIP_ID, serverDays);

  // `submit` is stable, so this hands the test one handle and never churns.
  useEffect(() => {
    onReady({ submit });
  }, [submit, onReady]);

  const [typed, setTyped] = useState('');

  return (
    <div>
      <ol data-testid="stops">
        {days[0]?.stops.map((entry) => (
          <li key={entry.id} data-testid={`stop-${entry.id}`}>
            {entry.name}
          </li>
        ))}
      </ol>
      <span data-testid="version">{days[0]?.version ?? -1}</span>
      <span data-testid="pending">{pendingCount}</span>
      <span data-testid="halted">{halted ? 'yes' : 'no'}</span>
      <input
        data-testid="field"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
    </div>
  );
}

export interface Mounted {
  api: { submit: (operation: ItineraryOperation) => void };
  text: (testId: string) => string;
  field: () => HTMLInputElement;
  stops: () => string[];
  unmount: () => void;
  rerender: (serverDays: ItineraryDayView[]) => Promise<void>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export async function mount(serverDays: ItineraryDayView[]): Promise<Mounted> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  let api!: { submit: (operation: ItineraryOperation) => void };
  const tree = (days: ItineraryDayView[]): ReactNode => (
    <ToastProvider>
      <Harness serverDays={days} onReady={(value) => (api = value)} />
    </ToastProvider>
  );

  await act(async () => {
    root!.render(tree(serverDays));
  });

  const host = container;
  return {
    get api() {
      return api;
    },
    text: (testId) => host.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '',
    field: () => host.querySelector('[data-testid="field"]') as HTMLInputElement,
    stops: () =>
      [...host.querySelectorAll('[data-testid="stops"] li')].map((li) => li.textContent ?? ''),
    unmount: () => {
      root?.unmount();
      host.remove();
    },
    rerender: async (days) => {
      await act(async () => {
        root!.render(tree(days));
      });
    },
  };
}

export function cleanup() {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
}
