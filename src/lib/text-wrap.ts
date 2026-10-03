/**
 * Line breaking for text drawn on a canvas, where nothing wraps on its own.
 *
 * Thai does not put spaces between words, so breaking on whitespace would hand
 * back one unbroken line the width of a paragraph. `Intl.Segmenter` knows where
 * Thai words end; where it is missing, whitespace is the next best guess and a
 * run too long for a line is broken character by character rather than allowed
 * to run off the edge.
 */

type SegmenterCtor = new (
  locale: string,
  options: { granularity: 'word' },
) => { segment: (value: string) => Iterable<{ segment: string }> };

function segmenter(): SegmenterCtor | null {
  const candidate = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  return typeof candidate === 'function' ? candidate : null;
}

/**
 * The places a line is allowed to break, as the pieces between them.
 * Whitespace is kept so joining the pieces reproduces the input exactly.
 */
export function wrapSegments(text: string): string[] {
  const Segmenter = segmenter();
  if (Segmenter) {
    try {
      return [...new Segmenter('th', { granularity: 'word' }).segment(text)].map(
        (entry) => entry.segment,
      );
    } catch {
      // An engine that has the constructor but rejects the locale: fall through.
    }
  }
  return text.split(/(\s+)/).filter((part) => part !== '');
}

/**
 * `text` broken into lines that each measure at most `maxWidth`.
 *
 * `measure` must already be bound to the font the text will be drawn in.
 * Always returns at least one line, so a caller can advance by `lines.length`
 * without special-casing the empty string.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];
  let current = '';

  for (const segment of wrapSegments(text)) {
    // A single run wider than the whole line — a long URL, a word with no
    // break in it — is split by character; everything else stays whole.
    const pieces = measure(segment) > maxWidth ? [...segment] : [segment];

    for (const piece of pieces) {
      if (current !== '' && measure(current + piece) > maxWidth) {
        lines.push(current.trimEnd());
        // A line never opens with the space that ended the one before it.
        current = piece.trim() === '' ? '' : piece;
      } else {
        current = current + piece;
      }
    }
  }

  const last = current.trimEnd();
  if (last !== '' || lines.length === 0) lines.push(last);
  return lines;
}

/**
 * At most `maxLines` lines, the last one ending in an ellipsis when anything
 * was dropped. One absurd name cannot stretch a layout built around it.
 */
export function clampLines(lines: string[], maxLines: number): string[] {
  if (maxLines < 1 || lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].trimEnd()}…`;
  return kept;
}
