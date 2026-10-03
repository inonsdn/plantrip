/**
 * Paints a `SharePlan` onto a canvas and hands back a PNG.
 *
 * Canvas rather than a screenshot library: the app's palette is CSS custom
 * properties and its type is a web font, both of which DOM-to-image converters
 * routinely drop, and a picture of the trip that comes out unstyled or with the
 * Thai set in a fallback face is worse than no picture. Drawing it directly
 * costs a layout pass and buys exact control, no dependency, and a file that is
 * identical on every device.
 *
 * Layout happens once into a list of primitives, which also yields the height;
 * the canvas is then sized to fit and the list replayed. Nothing is measured
 * twice and there is no second copy of the layout rules to drift.
 */

import { APP_NAME } from '@/lib/branding';
import { clampLines, wrapLines } from '@/lib/text-wrap';
import type { SharePlan, SharePlanDay } from './share-plan';

export const POSTER_WIDTH = 1080;

/**
 * iOS Safari refuses a canvas above roughly this many pixels of area, returning
 * a blank bitmap rather than an error. The drawing is scaled to stay under it,
 * so a long trip comes out slightly softer instead of entirely empty.
 */
const MAX_CANVAS_AREA = 16_777_216;
const MAX_SCALE = 2;

const PAD = 56;
const BLOCK_PAD_X = 28;
const BLOCK_PAD_Y = 26;
const CIRCLE_RADIUS = 19;
const STOP_TEXT_OFFSET = 58;

export interface PosterColors {
  brand: string;
  brandStrong: string;
  brandSoft: string;
  canvas: string;
  surface: string;
  lineStrong: string;
  ink: string;
  inkSoft: string;
  muted: string;
  accent: string;
  negative: string;
  onBrand: string;
}

const FALLBACK_COLORS: PosterColors = {
  brand: '#6750c4',
  brandStrong: '#5b4bc4',
  brandSoft: '#e6e6fa',
  canvas: '#f5f7fa',
  surface: '#ffffff',
  lineStrong: '#cbd5e1',
  ink: '#0f2540',
  inkSoft: '#33507a',
  muted: '#64748b',
  accent: '#f26a4b',
  negative: '#d2482f',
  onBrand: '#ffffff',
};

const FALLBACK_FAMILY = 'ui-sans-serif, system-ui, sans-serif';

/**
 * The live design tokens, so a palette change in globals.css reaches the
 * picture without anyone remembering to edit this file too.
 */
export function readPosterColors(root: HTMLElement): PosterColors {
  const style = getComputedStyle(root);
  const pick = (token: string, fallback: string): string => {
    const value = style.getPropertyValue(token).trim();
    return value === '' ? fallback : value;
  };

  return {
    brand: pick('--color-brand', FALLBACK_COLORS.brand),
    brandStrong: pick('--color-brand-strong', FALLBACK_COLORS.brandStrong),
    brandSoft: pick('--color-brand-soft', FALLBACK_COLORS.brandSoft),
    canvas: pick('--color-canvas', FALLBACK_COLORS.canvas),
    surface: pick('--color-surface', FALLBACK_COLORS.surface),
    lineStrong: pick('--color-line-strong', FALLBACK_COLORS.lineStrong),
    ink: pick('--color-ink', FALLBACK_COLORS.ink),
    inkSoft: pick('--color-ink-soft', FALLBACK_COLORS.inkSoft),
    muted: pick('--color-muted', FALLBACK_COLORS.muted),
    accent: pick('--color-accent', FALLBACK_COLORS.accent),
    negative: pick('--color-negative', FALLBACK_COLORS.negative),
    onBrand: FALLBACK_COLORS.onBrand,
  };
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

type Op =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; fill: string; radius: number }
  | { kind: 'circle'; x: number; y: number; radius: number; fill: string }
  | { kind: 'line'; x: number; y: number; toX: number; toY: number; stroke: string; width: number }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      font: string;
      fill: string;
      align: CanvasTextAlign;
      baseline: CanvasTextBaseline;
    };

/** One coloured piece of a line that flows inline with its neighbours. */
interface TextRun {
  text: string;
  fill: string;
}

class Layout {
  readonly ops: Op[] = [];
  y = 0;

  constructor(
    private readonly measureContext: CanvasRenderingContext2D,
    private readonly family: string,
  ) {}

  font(weight: number, size: number): string {
    return `${weight} ${size}px ${this.family}`;
  }

  measure(text: string, font: string): number {
    this.measureContext.font = font;
    return this.measureContext.measureText(text).width;
  }

  push(op: Op): void {
    this.ops.push(op);
  }

  /** Holds a slot for something whose size is only known once it is filled. */
  reserve(): number {
    this.ops.push({ kind: 'rect', x: 0, y: 0, width: 0, height: 0, fill: 'transparent', radius: 0 });
    return this.ops.length - 1;
  }

  place(slot: number, op: Op): void {
    this.ops[slot] = op;
  }

  text(
    value: string,
    x: number,
    y: number,
    font: string,
    fill: string,
    align: CanvasTextAlign = 'left',
    baseline: CanvasTextBaseline = 'top',
  ): void {
    this.push({ kind: 'text', x, y, text: value, font, fill, align, baseline });
  }

  /**
   * A wrapped paragraph, advancing `y` past it. Returns the height used.
   */
  paragraph(
    value: string,
    x: number,
    maxWidth: number,
    font: string,
    fill: string,
    lineHeight: number,
    maxLines: number,
  ): number {
    const lines = clampLines(
      wrapLines(value, maxWidth, (candidate) => this.measure(candidate, font)),
      maxLines,
    );
    for (const line of lines) {
      this.text(line, x, this.y, font, fill);
      this.y += lineHeight;
    }
    return lines.length * lineHeight;
  }

  /**
   * Coloured runs flowed on one line, wrapping between runs when they no longer
   * fit. Runs are short labels, so they are never broken apart.
   */
  runs(
    items: readonly TextRun[],
    x: number,
    maxWidth: number,
    font: string,
    separator: string,
    separatorFill: string,
    lineHeight: number,
  ): void {
    let cursor = x;
    let started = false;

    for (const item of items) {
      if (item.text === '') continue;
      const prefix = started ? separator : '';
      const prefixWidth = this.measure(prefix, font);
      const itemWidth = this.measure(item.text, font);

      if (started && cursor + prefixWidth + itemWidth > x + maxWidth) {
        this.y += lineHeight;
        cursor = x;
        this.text(item.text, cursor, this.y, font, item.fill);
        cursor += itemWidth;
        continue;
      }

      if (prefix !== '') {
        this.text(prefix, cursor, this.y, font, separatorFill);
        cursor += prefixWidth;
      }
      this.text(item.text, cursor, this.y, font, item.fill);
      cursor += itemWidth;
      started = true;
    }

    if (started) this.y += lineHeight;
  }
}

// ---------------------------------------------------------------------------
// the poster
// ---------------------------------------------------------------------------

function layoutHeader(layout: Layout, plan: SharePlan, colors: PosterColors): void {
  const slot = layout.reserve();
  const width = POSTER_WIDTH - PAD * 2;

  layout.y = 54;
  layout.text(
    'แผนการเดินทาง',
    PAD,
    layout.y,
    layout.font(600, 24),
    'rgba(255, 255, 255, 0.72)',
  );
  layout.y += 40;

  layout.paragraph(plan.title, PAD, width, layout.font(700, 52), colors.onBrand, 66, 2);
  layout.y += 8;
  layout.paragraph(
    plan.subtitle,
    PAD,
    width,
    layout.font(500, 26),
    'rgba(255, 255, 255, 0.88)',
    36,
    2,
  );
  layout.y += 54;

  layout.place(slot, {
    kind: 'rect',
    x: 0,
    y: 0,
    width: POSTER_WIDTH,
    height: layout.y,
    fill: colors.brand,
    radius: 0,
  });
}

function layoutStop(
  layout: Layout,
  stop: SharePlanDay['stops'][number],
  colors: PosterColors,
  innerLeft: number,
  innerWidth: number,
  previousCentre: number | null,
): number {
  const rowTop = layout.y;
  const centreX = innerLeft + CIRCLE_RADIUS;
  const centreY = rowTop + 20;

  // Drawn before the circle it leads to, and stopping short of both, so the
  // rail reads as a thread rather than a line crossing the numbers.
  if (previousCentre !== null) {
    layout.push({
      kind: 'line',
      x: centreX,
      y: previousCentre + CIRCLE_RADIUS + 5,
      toX: centreX,
      toY: centreY - CIRCLE_RADIUS - 5,
      stroke: colors.lineStrong,
      width: 2,
    });
  }

  layout.push({ kind: 'circle', x: centreX, y: centreY, radius: CIRCLE_RADIUS, fill: colors.brand });
  layout.text(
    String(stop.order),
    centreX,
    centreY + 1,
    layout.font(700, 21),
    colors.onBrand,
    'center',
    'middle',
  );

  const textLeft = innerLeft + STOP_TEXT_OFFSET;
  const textWidth = innerWidth - STOP_TEXT_OFFSET;

  layout.paragraph(
    stop.name,
    textLeft,
    textWidth,
    layout.font(600, 29),
    stop.warning ? colors.negative : colors.ink,
    38,
    2,
  );
  layout.y += 2;

  layout.runs(
    [
      { text: stop.times, fill: colors.inkSoft },
      ...(stop.visit === null ? [] : [{ text: stop.visit, fill: colors.inkSoft }]),
      ...(stop.wait === null ? [] : [{ text: stop.wait, fill: colors.accent }]),
      ...(stop.warning ? [{ text: 'เวลาไม่เรียงลำดับ', fill: colors.negative }] : []),
    ],
    textLeft,
    textWidth,
    layout.font(400, 23),
    ' · ',
    colors.muted,
    32,
  );

  layout.y = Math.max(layout.y, centreY + CIRCLE_RADIUS) + 16;
  return centreY;
}

function layoutDay(layout: Layout, day: SharePlanDay, colors: PosterColors): void {
  const slot = layout.reserve();
  const blockTop = layout.y;
  const innerLeft = PAD + BLOCK_PAD_X;
  const innerWidth = POSTER_WIDTH - PAD * 2 - BLOCK_PAD_X * 2;

  layout.y = blockTop + BLOCK_PAD_Y;

  // Day header: the pill people already use to switch days, then the date,
  // with the start time pinned to the far edge.
  const pillFont = layout.font(700, 22);
  const pillLabel = `วันที่ ${day.index}`;
  const pillWidth = layout.measure(pillLabel, pillFont) + 28;
  layout.push({
    kind: 'rect',
    x: innerLeft,
    y: layout.y,
    width: pillWidth,
    height: 36,
    fill: colors.brandSoft,
    radius: 18,
  });
  layout.text(
    pillLabel,
    innerLeft + pillWidth / 2,
    layout.y + 19,
    pillFont,
    colors.brandStrong,
    'center',
    'middle',
  );
  layout.text(
    day.dateLabel,
    innerLeft + pillWidth + 14,
    layout.y + 19,
    layout.font(700, 31),
    colors.ink,
    'left',
    'middle',
  );
  layout.text(
    day.startLabel,
    innerLeft + innerWidth,
    layout.y + 19,
    layout.font(500, 23),
    colors.muted,
    'right',
    'middle',
  );
  layout.y += 36;

  if (day.totalsLabel !== null) {
    layout.y += 10;
    layout.paragraph(
      day.totalsLabel,
      innerLeft,
      innerWidth,
      layout.font(400, 23),
      colors.muted,
      32,
      1,
    );
  }

  layout.y += 20;

  if (day.stops.length === 0) {
    layout.paragraph(
      'ยังไม่มีสถานที่ในวันนี้',
      innerLeft,
      innerWidth,
      layout.font(500, 25),
      colors.muted,
      34,
      1,
    );
  } else {
    let previousCentre: number | null = null;
    for (const stop of day.stops) {
      previousCentre = layoutStop(layout, stop, colors, innerLeft, innerWidth, previousCentre);
    }
    // The gap after the final stop belongs to the block, not between stops.
    layout.y -= 16;
  }

  layout.y += BLOCK_PAD_Y;

  layout.place(slot, {
    kind: 'rect',
    x: PAD,
    y: blockTop,
    width: POSTER_WIDTH - PAD * 2,
    height: layout.y - blockTop,
    fill: colors.surface,
    radius: 24,
  });
}

function layoutPoster(
  plan: SharePlan,
  measureContext: CanvasRenderingContext2D,
  colors: PosterColors,
  family: string,
): { ops: Op[]; height: number } {
  const layout = new Layout(measureContext, family);

  layoutHeader(layout, plan, colors);

  for (const day of plan.days) {
    layout.y += 28;
    layoutDay(layout, day, colors);
  }

  layout.y += 36;
  layout.text(
    `${APP_NAME} · ${plan.footnote}`,
    POSTER_WIDTH / 2,
    layout.y,
    layout.font(500, 23),
    colors.muted,
    'center',
  );
  layout.y += 32 + PAD;

  return { ops: layout.ops, height: Math.ceil(layout.y) };
}

function paint(
  context: CanvasRenderingContext2D,
  ops: readonly Op[],
  height: number,
  colors: PosterColors,
): void {
  context.fillStyle = colors.canvas;
  context.fillRect(0, 0, POSTER_WIDTH, height);

  for (const op of ops) {
    switch (op.kind) {
      case 'rect': {
        if (op.width <= 0 || op.height <= 0) break;
        context.fillStyle = op.fill;
        context.beginPath();
        context.roundRect(op.x, op.y, op.width, op.height, op.radius);
        context.fill();
        break;
      }
      case 'circle': {
        context.fillStyle = op.fill;
        context.beginPath();
        context.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
        context.fill();
        break;
      }
      case 'line': {
        context.strokeStyle = op.stroke;
        context.lineWidth = op.width;
        context.beginPath();
        context.moveTo(op.x, op.y);
        context.lineTo(op.toX, op.toY);
        context.stroke();
        break;
      }
      case 'text': {
        context.font = op.font;
        context.fillStyle = op.fill;
        context.textAlign = op.align;
        context.textBaseline = op.baseline;
        context.fillText(op.text, op.x, op.y);
        break;
      }
    }
  }
}

/** Big enough to stay sharp, small enough that the device will allocate it. */
export function posterScale(height: number): number {
  const fitted = Math.sqrt(MAX_CANVAS_AREA / (POSTER_WIDTH * Math.max(height, 1)));
  return Math.max(1, Math.min(MAX_SCALE, fitted));
}

export interface PosterImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Draws `plan` and returns it as a PNG.
 *
 * Waits for the web font first: measuring against a fallback face and then
 * drawing with the real one produces lines that overflow their boxes.
 */
export async function renderSharePoster(plan: SharePlan): Promise<PosterImage> {
  if (typeof document.fonts?.ready?.then === 'function') {
    try {
      await document.fonts.ready;
    } catch {
      // A browser that cannot report font readiness still draws; the measuring
      // pass just uses whatever is loaded by now.
    }
  }

  const colors = readPosterColors(document.documentElement);
  const family = getComputedStyle(document.body).fontFamily || FALLBACK_FAMILY;

  const scratch = document.createElement('canvas').getContext('2d');
  if (!scratch) throw new Error('เบราว์เซอร์นี้ไม่รองรับการสร้างรูป');

  const { ops, height } = layoutPoster(plan, scratch, colors, family);

  const scale = posterScale(height);
  const canvas = document.createElement('canvas');
  // Rounded down, never up: rounding up could cross the area ceiling that
  // `posterScale` just worked to stay under, and cost a blank picture.
  canvas.width = Math.floor(POSTER_WIDTH * scale);
  canvas.height = Math.floor(height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('เบราว์เซอร์นี้ไม่รองรับการสร้างรูป');
  context.scale(scale, scale);
  paint(context, ops, height, colors);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('สร้างรูปไม่สำเร็จ');

  return { blob, width: canvas.width, height: canvas.height };
}
