import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  fitBounds,
  formatDistance,
  fromWorld,
  legColor,
  projectToScreen,
  tileUrl,
  toWorld,
  unprojectFromScreen,
  visibleTiles,
} from '@/lib/itinerary/geo';

describe('web mercator projection', () => {
  it('round-trips coordinates in Thailand and Japan', () => {
    for (const point of [
      { latitude: 13.7563, longitude: 100.5018 },
      { latitude: 35.6762, longitude: 139.6503 },
      { latitude: -33.8688, longitude: 151.2093 },
    ]) {
      const back = fromWorld(toWorld(point));
      expect(back.latitude).toBeCloseTo(point.latitude, 9);
      expect(back.longitude).toBeCloseTo(point.longitude, 9);
    }
  });

  it('places the null island at the centre of the world square', () => {
    expect(toWorld({ latitude: 0, longitude: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps latitudes beyond the mercator limit instead of returning infinity', () => {
    const world = toWorld({ latitude: 89.9, longitude: 0 });
    expect(Number.isFinite(world.y)).toBe(true);
    // The clamp lands on the top edge of the square rather than running off it.
    expect(world.y).toBeCloseTo(0, 9);
    expect(Number.isFinite(toWorld({ latitude: -89.9, longitude: 0 }).y)).toBe(true);
  });
});

describe('viewport maths', () => {
  const bangkok = toWorld({ latitude: 13.7563, longitude: 100.5018 });
  const chiangMai = toWorld({ latitude: 18.7883, longitude: 98.9853 });

  it('fits both points inside the padded viewport', () => {
    const bounds = boundsOf([bangkok, chiangMai]);
    expect(bounds).not.toBeNull();

    const viewport = fitBounds(bounds!, 800, 600, 48);
    for (const point of [bangkok, chiangMai]) {
      const screen = projectToScreen(point, viewport, 800, 600);
      expect(screen.left).toBeGreaterThanOrEqual(48 - 1);
      expect(screen.left).toBeLessThanOrEqual(800 - 48 + 1);
      expect(screen.top).toBeGreaterThanOrEqual(48 - 1);
      expect(screen.top).toBeLessThanOrEqual(600 - 48 + 1);
    }
  });

  it('gives a single point a readable zoom rather than the maximum', () => {
    const viewport = fitBounds(boundsOf([bangkok])!, 800, 600);
    expect(viewport.scale).toBe(256 * 2 ** 15);
    expect(viewport.centerX).toBeCloseTo(bangkok.x, 12);
  });

  it('projects and unprojects to the same place', () => {
    const viewport = fitBounds(boundsOf([bangkok, chiangMai])!, 800, 600);
    const screen = projectToScreen(bangkok, viewport, 800, 600);
    const back = unprojectFromScreen(screen.left, screen.top, viewport, 800, 600);
    expect(back.x).toBeCloseTo(bangkok.x, 12);
    expect(back.y).toBeCloseTo(bangkok.y, 12);
  });

  it('returns no bounds for no points', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('tiles', () => {
  it('covers the viewport and stays inside the vertical tile range', () => {
    const viewport = fitBounds(boundsOf([toWorld({ latitude: 13.75, longitude: 100.5 })])!, 512, 512);
    const tiles = visibleTiles(viewport, 512, 512);

    expect(tiles.length).toBeGreaterThan(0);
    const count = 2 ** tiles[0].z;
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(count);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(count);
    }
  });

  it('substitutes z, x and y into the template', () => {
    expect(
      tileUrl('https://tiles.example/{z}/{x}/{y}.png', {
        key: '4/3/2',
        z: 4,
        x: 3,
        y: 2,
        left: 0,
        top: 0,
        size: 256,
      }),
    ).toBe('https://tiles.example/4/3/2.png');
  });
});

describe('presentation helpers', () => {
  it('formats distances in Thai units', () => {
    expect(formatDistance(0)).toBe('0 ม.');
    expect(formatDistance(800)).toBe('800 ม.');
    expect(formatDistance(1500)).toBe('1.5 กม.');
    expect(formatDistance(23400)).toBe('23 กม.');
    expect(formatDistance(null)).toBe('—');
  });

  it('cycles leg colours so adjacent legs never share one', () => {
    expect(legColor(0)).not.toBe(legColor(1));
    expect(legColor(0)).toBe(legColor(8));
  });
});
