'use client';

import { useRef, useState } from 'react';
import { Loader2, MapPinPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import type { PlaceResult, PlaceSearchResult } from '@/lib/itinerary/providers/types';

export interface NewStopInput {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  placeProvider: string;
  placeId: string | null;
}

/**
 * Adding a place never asks for money: a stop is a plan item, and recording an
 * expense for it is a separate, optional step on the leg.
 */
export function AddStopPanel({
  tripId,
  busy,
  pickingOnMap,
  pickedCoordinates,
  onTogglePickOnMap,
  onAdd,
}: {
  tripId: string;
  busy: boolean;
  pickingOnMap: boolean;
  pickedCoordinates: { latitude: number; longitude: number } | null;
  onTogglePickOnMap: (next: boolean) => void;
  onAdd: (stop: NewStopInput) => void;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState<PlaceSearchResult | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const runId = useRef(0);

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
    });
    setQuery('');
    setSearch(null);
  }

  function addManual() {
    setManualError(null);
    const name = manualName.trim();
    const latitude = Number(pickedCoordinates ? pickedCoordinates.latitude : Number(manualLat));
    const longitude = Number(pickedCoordinates ? pickedCoordinates.longitude : Number(manualLng));

    if (!name) {
      setManualError('กรุณากรอกชื่อสถานที่');
      return;
    }
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      setManualError('พิกัดไม่ถูกต้อง');
      return;
    }

    onAdd({
      name,
      address: null,
      latitude,
      longitude,
      placeProvider: 'manual',
      placeId: null,
    });
    setManualName('');
    setManualLat('');
    setManualLng('');
    onTogglePickOnMap(false);
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <form onSubmit={runSearch} className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาสถานที่"
            aria-label="ค้นหาสถานที่"
            disabled={busy}
          />
        </span>
        <Button type="submit" disabled={busy || searching || !query.trim()}>
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
                  className="flex w-full min-h-11 items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-left text-sm hover:bg-canvas"
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

      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setManualOpen((open) => !open)}
          aria-expanded={manualOpen}
          className="text-sm font-medium text-brand-strong underline-offset-2 hover:underline"
        >
          เพิ่มจุดเอง (ปักหมุดหรือใส่พิกัด)
        </button>

        {manualOpen ? (
          <div className="mt-3 space-y-3">
            <Field label="ชื่อสถานที่" error={manualError}>
              <TextInput
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
                disabled={busy}
              />
            </Field>

            <Button
              type="button"
              variant={pickingOnMap ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onTogglePickOnMap(!pickingOnMap)}
            >
              {pickingOnMap ? 'กำลังรอให้แตะบนแผนที่…' : 'เลือกจุดบนแผนที่'}
            </Button>

            {pickedCoordinates ? (
              <p className="text-xs text-ink-soft">
                พิกัดที่เลือก {pickedCoordinates.latitude.toFixed(5)},{' '}
                {pickedCoordinates.longitude.toFixed(5)}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <span className="w-32">
                  <Field label="ละติจูด">
                    <TextInput
                      inputMode="decimal"
                      value={manualLat}
                      onChange={(event) => setManualLat(event.target.value)}
                      disabled={busy}
                    />
                  </Field>
                </span>
                <span className="w-32">
                  <Field label="ลองจิจูด">
                    <TextInput
                      inputMode="decimal"
                      value={manualLng}
                      onChange={(event) => setManualLng(event.target.value)}
                      disabled={busy}
                    />
                  </Field>
                </span>
              </div>
            )}

            <Button type="button" size="sm" disabled={busy} onClick={addManual}>
              เพิ่มจุดนี้
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
