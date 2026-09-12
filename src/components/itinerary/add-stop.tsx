'use client';

import { useRef, useState } from 'react';
import { Loader2, MapPinPlus, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { formatDuration } from '@/lib/itinerary/schedule';
import type { PlaceResult, PlaceSearchResult } from '@/lib/itinerary/providers/types';
import { TimeField } from './time-field';

export interface NewStopInput {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeProvider: string;
  placeId: string | null;
  visitDurationMinutes: number;
  notBeforeLocalTime: string | null;
}

const DURATION_SHORTCUTS = [15, 30, 60, 120] as const;

/**
 * Adding a place asks for a place: a name, when you mean to get there, and how
 * long you are staying. No money, and no coordinates — the plan is a list.
 */
export function AddStopPanel({
  tripId,
  searchEnabled,
  busy,
  onAdd,
}: {
  tripId: string;
  /** True only when a places provider is configured; search is hidden otherwise. */
  searchEnabled: boolean;
  busy: boolean;
  onAdd: (stop: NewStopInput) => void;
}) {
  const [name, setName] = useState('');
  const [arriveAt, setArriveAt] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState<PlaceSearchResult | null>(null);
  const runId = useRef(0);

  function reset() {
    setName('');
    setArriveAt(null);
    setDuration(60);
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('กรุณากรอกชื่อสถานที่');
      return;
    }
    onAdd({
      name: trimmed,
      address: null,
      latitude: null,
      longitude: null,
      placeProvider: 'manual',
      placeId: null,
      visitDurationMinutes: duration,
      notBeforeLocalTime: arriveAt,
    });
    reset();
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const currentRun = (runId.current += 1);
    setSearching(true);
    try {
      const response = await fetch('/api/itinerary/places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripId, query: trimmed }),
      });
      const result = (await response.json()) as PlaceSearchResult;
      // A slower earlier search must never overwrite a newer one.
      if (runId.current === currentRun) setSearch(result);
    } catch {
      if (runId.current === currentRun) {
        setSearch({
          status: 'provider_error',
          provider: 'none',
          results: [],
          attribution: null,
          message: 'ค้นหาสถานที่ไม่สำเร็จ',
        });
      }
    } finally {
      if (runId.current === currentRun) setSearching(false);
    }
  }

  function addFromResult(place: PlaceResult) {
    onAdd({
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      placeProvider: place.placeProvider,
      placeId: place.placeId,
      visitDurationMinutes: duration,
      notBeforeLocalTime: arriveAt,
    });
    setQuery('');
    setSearch(null);
    reset();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">เพิ่มสถานที่</h2>

      {searchEnabled ? (
        <>
          <form onSubmit={runSearch} className="mt-3 flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาสถานที่"
                aria-label="ค้นหาสถานที่"
                disabled={busy}
              />
            </span>
            <Button type="submit" variant="secondary" disabled={busy || searching || !query.trim()}>
              {searching ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Search aria-hidden className="size-4" />
              )}
              ค้นหา
            </Button>
          </form>

          {search ? (
            search.results.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {search.results.map((place, index) => (
                  <li key={`${place.placeId ?? place.name}-${index}`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => addFromResult(place)}
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-left text-sm hover:bg-canvas"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{place.name}</span>
                        {place.address ? (
                          <span className="block truncate text-xs text-muted">{place.address}</span>
                        ) : null}
                      </span>
                      <MapPinPlus aria-hidden className="size-4 shrink-0 text-brand" />
                    </button>
                  </li>
                ))}
                {search.attribution ? (
                  <li className="px-1 pt-1 text-[11px] text-muted">{search.attribution}</li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs leading-5 text-ink-soft">
                {search.message || 'ไม่พบสถานที่ที่ตรงกับคำค้นหา'}
              </p>
            )
          ) : null}
        </>
      ) : null}

      <form onSubmit={submit} className="mt-3 space-y-4">
        <Field label="ชื่อสถานที่" error={error} required>
          <TextInput
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            placeholder="เช่น สนามบินชิโตเซะ"
            disabled={busy}
          />
        </Field>

        <Field label="เวลาที่จะไปถึง" hint="ไม่ใส่ก็ได้ — แผนจะคำนวณเวลาถึงให้จากลำดับและเวลาเดินทาง">
          <TimeField
            value={arriveAt}
            onChange={setArriveAt}
            disabled={busy}
            clearable
            hourLabel="ชั่วโมงที่จะไปถึงของสถานที่ใหม่"
            minuteLabel="นาทีที่จะไปถึงของสถานที่ใหม่"
          />
        </Field>

        <Field label="อยู่ที่นี่นานเท่าไร">
          <div className="flex flex-wrap items-center gap-2">
            {DURATION_SHORTCUTS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={busy}
                onClick={() => setDuration(minutes)}
                aria-pressed={duration === minutes}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${
                  duration === minutes
                    ? 'border-brand bg-brand-soft text-brand-strong'
                    : 'border-line-strong bg-surface text-ink hover:bg-canvas'
                }`}
              >
                {formatDuration(minutes)}
              </button>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-20">
                <TextInput
                  inputMode="numeric"
                  aria-label="เวลาที่อยู่ (นาที)"
                  value={String(duration)}
                  disabled={busy}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1440) {
                      setDuration(Math.round(parsed));
                    }
                  }}
                />
              </span>
              <span className="text-sm text-muted">นาที</span>
            </span>
          </div>
        </Field>

        <Button type="submit" disabled={busy}>
          <Plus aria-hidden className="size-4" />
          เพิ่มลงในวันนี้
        </Button>
      </form>
    </div>
  );
}
