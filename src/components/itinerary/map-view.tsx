'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Crosshair, MapPin, Maximize2, Minus, Plus } from 'lucide-react';
import {
  boundsOf,
  fitBounds,
  fromWorld,
  projectToScreen,
  tileUrl,
  toWorld,
  unprojectFromScreen,
  visibleTiles,
  clampScale,
  type Viewport,
  type WorldPoint,
} from '@/lib/itinerary/geo';

export interface MapStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  enabled: boolean;
  /** 1-based order among enabled stops; null for a disabled stop. */
  order: number | null;
}

export interface MapLeg {
  legKey: string;
  color: string;
  originStopId: string;
  destinationStopId: string;
  /** Provider geometry as [longitude, latitude] pairs, or null when there is none. */
  geometry: Array<[number, number]> | null;
  visible: boolean;
  label: string;
}

const TILE_TEMPLATE = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? '';
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '';

export function MapView({
  stops,
  legs,
  selectedStopId,
  selectedLegKey,
  onSelectStop,
  onSelectLeg,
  onPickCoordinates,
  attributions,
  showApproximateConnectors,
  onToggleApproximateConnectors,
  onToggleLegVisible,
}: {
  stops: readonly MapStop[];
  legs: readonly MapLeg[];
  selectedStopId: string | null;
  selectedLegKey: string | null;
  onSelectStop: (stopId: string) => void;
  onSelectLeg: (legKey: string) => void;
  onPickCoordinates: ((latitude: number, longitude: number) => void) | null;
  attributions: readonly string[];
  showApproximateConnectors: boolean;
  onToggleApproximateConnectors: (next: boolean) => void;
  onToggleLegVisible: (legKey: string, next: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The viewport people have panned or zoomed to. Null means "follow the day",
  // which is what the derived fit below provides.
  const [override, setOverride] = useState<Viewport | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const legendId = useId();

  const stopById = useMemo(() => new Map(stops.map((stop) => [stop.id, stop])), [stops]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const dayPoints = useMemo<WorldPoint[]>(() => {
    const points = stops.map((stop) => toWorld(stop));
    for (const leg of legs) {
      if (!leg.visible || !leg.geometry) continue;
      for (const [longitude, latitude] of leg.geometry) points.push(toWorld({ latitude, longitude }));
    }
    return points;
  }, [stops, legs]);

  const autoViewport = useMemo<Viewport | null>(() => {
    const bounds = boundsOf(dayPoints);
    if (!bounds || size.width === 0) return null;
    return fitBounds(bounds, size.width, size.height);
  }, [dayPoints, size.width, size.height]);

  // A day whose stops changed starts from its own fit again rather than
  // stranding the viewer wherever the previous day happened to be.
  const fitSignature = `${stops.map((stop) => stop.id).join(',')}|${size.width}x${size.height}`;
  const [lastFitSignature, setLastFitSignature] = useState(fitSignature);
  if (lastFitSignature !== fitSignature) {
    setLastFitSignature(fitSignature);
    setOverride(null);
  }

  const viewport = override ?? autoViewport;

  const setViewport = useCallback(
    (next: Viewport | null | ((current: Viewport) => Viewport)) => {
      setOverride((current) => {
        if (typeof next !== 'function') return next;
        const base = current ?? autoViewport;
        return base ? next(base) : current;
      });
    },
    [autoViewport],
  );

  const fitAll = useCallback(() => setOverride(null), []);

  const fitSelection = useCallback(() => {
    const stop = selectedStopId ? stopById.get(selectedStopId) : null;
    const leg = selectedLegKey ? legs.find((candidate) => candidate.legKey === selectedLegKey) : null;

    const points: WorldPoint[] = [];
    if (leg) {
      const origin = stopById.get(leg.originStopId);
      const destination = stopById.get(leg.destinationStopId);
      if (origin) points.push(toWorld(origin));
      if (destination) points.push(toWorld(destination));
      for (const [longitude, latitude] of leg.geometry ?? []) {
        points.push(toWorld({ latitude, longitude }));
      }
    } else if (stop) {
      points.push(toWorld(stop));
    }

    const bounds = boundsOf(points);
    if (!bounds || size.width === 0) return;
    setOverride(fitBounds(bounds, size.width, size.height, 64));
  }, [legs, selectedLegKey, selectedStopId, size.height, size.width, stopById]);

  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!viewport) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId || !viewport) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true;
    state.x = event.clientX;
    state.y = event.clientY;
    setViewport((current) => ({
      ...current,
      centerX: current.centerX - dx / current.scale,
      centerY: current.centerY - dy / current.scale,
    }));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state || !viewport || state.moved || !onPickCoordinates) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const world = unprojectFromScreen(
      event.clientX - rect.left,
      event.clientY - rect.top,
      viewport,
      size.width,
      size.height,
    );
    const { latitude, longitude } = fromWorld(world);
    onPickCoordinates(latitude, ((((longitude + 180) % 360) + 360) % 360) - 180);
  }

  function zoomBy(factor: number) {
    setViewport((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!viewport) return;
    zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2);
  }

  const project = (point: { latitude: number; longitude: number }) =>
    viewport ? projectToScreen(toWorld(point), viewport, size.width, size.height) : null;

  const tiles =
    viewport && TILE_TEMPLATE && size.width > 0
      ? visibleTiles(viewport, size.width, size.height)
      : [];

  const visibleLegs = legs.filter((leg) => leg.visible);
  const missingGeometryCount = visibleLegs.filter((leg) => !leg.geometry).length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-line bg-canvas">
      <div
        ref={containerRef}
        className={`absolute inset-0 ${onPickCoordinates ? 'cursor-crosshair' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={handleWheel}
        role="presentation"
      >
        {TILE_TEMPLATE ? (
          tiles.map((tile) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              src={tileUrl(TILE_TEMPLATE, tile)}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
                width: `${tile.size + 1}px`,
                height: `${tile.size + 1}px`,
              }}
            />
          ))
        ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        )}

        {viewport && size.width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0"
            width={size.width}
            height={size.height}
            aria-hidden
          >
            {visibleLegs.map((leg) => {
              const emphasised = leg.legKey === selectedLegKey;
              if (leg.geometry) {
                const points = leg.geometry
                  .map(([longitude, latitude]) => {
                    const placed = projectToScreen(
                      toWorld({ latitude, longitude }),
                      viewport,
                      size.width,
                      size.height,
                    );
                    return `${placed.left},${placed.top}`;
                  })
                  .join(' ');
                return (
                  <polyline
                    key={leg.legKey}
                    points={points}
                    fill="none"
                    stroke={leg.color}
                    strokeWidth={emphasised ? 6 : 4}
                    strokeOpacity={emphasised ? 1 : 0.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }

              // No provider geometry. A straight line is NOT the route, so it is
              // only drawn when explicitly asked for, and always dashed and
              // labelled as an approximation in the legend.
              if (!showApproximateConnectors) return null;
              const origin = stopById.get(leg.originStopId);
              const destination = stopById.get(leg.destinationStopId);
              if (!origin || !destination) return null;
              const a = projectToScreen(toWorld(origin), viewport, size.width, size.height);
              const b = projectToScreen(toWorld(destination), viewport, size.width, size.height);
              return (
                <line
                  key={leg.legKey}
                  x1={a.left}
                  y1={a.top}
                  x2={b.left}
                  y2={b.top}
                  stroke={leg.color}
                  strokeWidth={emphasised ? 4 : 3}
                  strokeDasharray="2 8"
                  strokeLinecap="round"
                  strokeOpacity={0.7}
                />
              );
            })}
          </svg>
        ) : null}

        {viewport && size.width > 0
          ? stops.map((stop) => {
              const placed = project(stop);
              if (!placed) return null;
              const selected = stop.id === selectedStopId;
              return (
                <button
                  key={stop.id}
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onSelectStop(stop.id)}
                  aria-pressed={selected}
                  className={`absolute z-10 flex min-h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong ${
                    stop.enabled
                      ? 'border-white bg-brand text-white'
                      : 'border-dashed border-line-strong bg-surface text-muted'
                  } ${selected ? 'scale-125 ring-2 ring-brand-strong ring-offset-2' : ''}`}
                  style={{ left: `${placed.left}px`, top: `${placed.top}px` }}
                >
                  <span className="sr-only">{stop.name}</span>
                  <span aria-hidden>{stop.order ?? '—'}</span>
                </button>
              );
            })
          : null}
      </div>

      {/* Framing controls sit top right, clear of the floating add button. */}
      <div className="absolute right-3 top-3 z-20 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={fitAll}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-2.5 text-xs font-semibold text-ink shadow-sm backdrop-blur hover:bg-canvas"
        >
          <Maximize2 aria-hidden className="size-3.5" />
          ดูทั้งวัน
        </button>
        <button
          type="button"
          onClick={fitSelection}
          disabled={!selectedStopId && !selectedLegKey}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-2.5 text-xs font-semibold text-ink shadow-sm backdrop-blur hover:bg-canvas disabled:text-muted"
        >
          <Crosshair aria-hidden className="size-3.5" />
          ดูจุดที่เลือก
        </button>
      </div>

      {/* Zoom stays bottom left, above the mobile bottom navigation. */}
      <div className="absolute bottom-0 left-0 z-20 p-3 pb-[calc(0.75rem+4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6">
        <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface/95 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={() => zoomBy(1.4)}
            className="inline-flex size-10 items-center justify-center text-ink hover:bg-canvas"
          >
            <Plus aria-hidden className="size-4" />
            <span className="sr-only">ขยายแผนที่</span>
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.4)}
            className="inline-flex size-10 items-center justify-center border-t border-line text-ink hover:bg-canvas"
          >
            <Minus aria-hidden className="size-4" />
            <span className="sr-only">ย่อแผนที่</span>
          </button>
        </div>
      </div>

      {/* Compact legend: collapsed to a single chip until opened. */}
      <div className="absolute left-3 top-3 z-20 max-w-[min(18rem,calc(100%-1.5rem))]">
        <button
          type="button"
          onClick={() => setLegendOpen((open) => !open)}
          aria-expanded={legendOpen}
          aria-controls={legendId}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-2.5 text-xs font-semibold text-ink shadow-sm backdrop-blur"
        >
          <MapPin aria-hidden className="size-3.5 text-brand" />
          เส้นทาง {visibleLegs.length}/{legs.length}
        </button>

        {legendOpen ? (
          <div
            id={legendId}
            className="mt-2 max-h-[45vh] overflow-y-auto rounded-lg border border-line bg-surface/95 p-2 text-xs shadow-sm backdrop-blur"
          >
            {legs.length === 0 ? (
              <p className="px-1 py-1 text-muted">วันนี้ยังไม่มีเส้นทาง</p>
            ) : (
              <ul className="space-y-1">
                {legs.map((leg) => (
                  <li key={leg.legKey}>
                    <label className="flex items-start gap-2 rounded px-1 py-1 hover:bg-canvas">
                      <input
                        type="checkbox"
                        checked={leg.visible}
                        onChange={(event) => onToggleLegVisible(leg.legKey, event.target.checked)}
                        className="mt-0.5 size-4 shrink-0 accent-brand"
                      />
                      <span
                        aria-hidden
                        className="mt-1 h-1 w-5 shrink-0 rounded-full"
                        style={{ backgroundColor: leg.color }}
                      />
                      <button
                        type="button"
                        onClick={() => onSelectLeg(leg.legKey)}
                        className="min-w-0 flex-1 text-left leading-5 text-ink"
                      >
                        {leg.label}
                        {leg.geometry ? null : (
                          <span className="block text-[11px] text-muted">ไม่มีเส้นทางจริง</span>
                        )}
                      </button>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {missingGeometryCount > 0 ? (
              <label className="mt-2 flex items-start gap-2 border-t border-line px-1 pt-2">
                <input
                  type="checkbox"
                  checked={showApproximateConnectors}
                  onChange={(event) => onToggleApproximateConnectors(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-brand"
                />
                <span className="leading-5 text-ink">
                  ลากเส้นประเชื่อมจุด
                  <span className="block text-[11px] text-muted">
                    เส้นตรงโดยประมาณ ไม่ใช่เส้นทางจริง
                  </span>
                </span>
              </label>
            ) : null}

            {!TILE_TEMPLATE ? (
              <p className="mt-2 border-t border-line px-1 pt-2 text-[11px] leading-4 text-muted">
                แผนที่นี้แสดงเฉพาะจุดและเส้นทาง ไม่มีภาพแผนที่พื้นหลัง
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {attributions.length > 0 || TILE_ATTRIBUTION ? (
        <p className="pointer-events-none absolute bottom-0 right-0 z-10 max-w-full truncate bg-surface/80 px-2 py-0.5 text-[10px] text-muted">
          {[TILE_ATTRIBUTION, ...attributions].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
