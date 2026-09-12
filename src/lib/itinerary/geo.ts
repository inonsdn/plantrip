/**
 * Web Mercator helpers for the itinerary map.
 *
 * Coordinates are normalised to the unit square (0..1) so the map's own state
 * is just a centre point plus a scale in pixels-per-world; screen positions and
 * XYZ tile indices both fall out of that with no external library.
 */

export interface Point {
  latitude: number;
  longitude: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MAX_LATITUDE = 85.05112878;

export function toWorld({ latitude, longitude }: Point): WorldPoint {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const radians = (clamped * Math.PI) / 180;
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI),
  };
}

export function fromWorld({ x, y }: WorldPoint): Point {
  const longitude = x * 360 - 180;
  const n = Math.PI * (1 - 2 * y);
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { latitude, longitude };
}

export function boundsOf(points: readonly WorldPoint[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Scale in pixels per world unit. 256 means the whole world is 256px wide. */
export const MIN_SCALE = 256;
export const MAX_SCALE = 256 * 2 ** 19;

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export interface Viewport {
  centerX: number;
  centerY: number;
  scale: number;
}

/** A viewport that shows the whole bounds inside `width` x `height`, with padding. */
export function fitBounds(
  bounds: Bounds,
  width: number,
  height: number,
  paddingPx = 48,
): Viewport {
  const usableWidth = Math.max(32, width - paddingPx * 2);
  const usableHeight = Math.max(32, height - paddingPx * 2);
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-7);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-7);

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    // A single point has no span worth fitting, so it gets a readable street
    // level rather than the maximum zoom.
    scale:
      bounds.maxX - bounds.minX < 1e-6 && bounds.maxY - bounds.minY < 1e-6
        ? 256 * 2 ** 15
        : clampScale(Math.min(usableWidth / spanX, usableHeight / spanY)),
  };
}

export function projectToScreen(
  point: WorldPoint,
  viewport: Viewport,
  width: number,
  height: number,
): { left: number; top: number } {
  return {
    left: (point.x - viewport.centerX) * viewport.scale + width / 2,
    top: (point.y - viewport.centerY) * viewport.scale + height / 2,
  };
}

export function unprojectFromScreen(
  left: number,
  top: number,
  viewport: Viewport,
  width: number,
  height: number,
): WorldPoint {
  return {
    x: (left - width / 2) / viewport.scale + viewport.centerX,
    y: (top - height / 2) / viewport.scale + viewport.centerY,
  };
}

export interface TilePlacement {
  key: string;
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
  size: number;
}

/**
 * The XYZ tiles covering the viewport. Returns nothing when no tile template is
 * configured — the map then draws its own grid and says so.
 */
export function visibleTiles(
  viewport: Viewport,
  width: number,
  height: number,
  maxZoom = 19,
): TilePlacement[] {
  const z = Math.max(0, Math.min(maxZoom, Math.round(Math.log2(viewport.scale / 256))));
  const count = 2 ** z;
  const tileSize = viewport.scale / count;

  const topLeft = unprojectFromScreen(0, 0, viewport, width, height);
  const bottomRight = unprojectFromScreen(width, height, viewport, width, height);

  const firstX = Math.floor(topLeft.x * count);
  const lastX = Math.floor(bottomRight.x * count);
  const firstY = Math.max(0, Math.floor(topLeft.y * count));
  const lastY = Math.min(count - 1, Math.floor(bottomRight.y * count));

  const tiles: TilePlacement[] = [];
  for (let x = firstX; x <= lastX; x += 1) {
    for (let y = firstY; y <= lastY; y += 1) {
      // Horizontal wrap: the same tile repeats across the antimeridian.
      const wrappedX = ((x % count) + count) % count;
      const placed = projectToScreen({ x: x / count, y: y / count }, viewport, width, height);
      tiles.push({
        key: `${z}/${x}/${y}`,
        z,
        x: wrappedX,
        y,
        left: placed.left,
        top: placed.top,
        size: tileSize,
      });
    }
  }
  return tiles;
}

export function tileUrl(template: string, tile: TilePlacement): string {
  return template
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

/** Distinct, print-safe colours; legs cycle through them in itinerary order. */
export const LEG_COLORS = [
  '#6750c4',
  '#0f8f6c',
  '#f26a4b',
  '#2563eb',
  '#b45309',
  '#be185d',
  '#0e7490',
  '#65a30d',
] as const;

export function legColor(index: number): string {
  return LEG_COLORS[index % LEG_COLORS.length];
}

/** `1500` -> `1.5 กม.`; `800` -> `800 ม.` */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${Math.round(meters)} ม.`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : String(Math.round(km))} กม.`;
}
