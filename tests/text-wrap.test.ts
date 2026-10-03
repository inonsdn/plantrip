import { describe, expect, it } from 'vitest';
import { clampLines, wrapLines, wrapSegments } from '@/lib/text-wrap';

/** A stand-in for a canvas: every character is ten units wide. */
const measure = (value: string) => [...value].length * 10;

describe('wrapSegments', () => {
  it('finds word boundaries in Thai, which has no spaces', () => {
    const segments = wrapSegments('ไปเที่ยวญี่ปุ่น');
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join('')).toBe('ไปเที่ยวญี่ปุ่น');
  });

  it('keeps whitespace, so the pieces still rebuild the input', () => {
    expect(wrapSegments('Furano Cheese factory').join('')).toBe('Furano Cheese factory');
  });
});

describe('wrapLines', () => {
  it('breaks a line that is too wide', () => {
    expect(wrapLines('aaaa bbbb cccc', 90, measure)).toEqual(['aaaa bbbb', 'cccc']);
  });

  it('leaves a line that fits alone', () => {
    expect(wrapLines('aaaa bbbb', 200, measure)).toEqual(['aaaa bbbb']);
  });

  it('never opens a line with the space that ended the one before it', () => {
    for (const line of wrapLines('aaaa bbbb cccc dddd', 90, measure)) {
      expect(line).toBe(line.trim());
    }
  });

  it('breaks a single run that cannot fit on any line', () => {
    const lines = wrapLines('aaaaaaaaaaaaaaa', 50, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('aaaaaaaaaaaaaaa');
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(50);
  });

  it('keeps every line inside the width it was given', () => {
    const text = 'เดินทางจาก Furano Cheese factory ไปยัง Sotetsu hotel แล้วต่อไป Nanda buffet';
    for (const line of wrapLines(text, 200, measure)) {
      expect(measure(line)).toBeLessThanOrEqual(200);
    }
  });

  it('loses nothing it was given', () => {
    const text = 'ไปเที่ยวฮอกไกโดกันเถอะ';
    expect(wrapLines(text, 60, measure).join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });

  it('returns one empty line for empty text, so callers can advance blindly', () => {
    expect(wrapLines('', 100, measure)).toEqual(['']);
    expect(wrapLines('   ', 100, measure)).toEqual(['']);
  });
});

describe('clampLines', () => {
  it('marks the cut with an ellipsis', () => {
    expect(clampLines(['one', 'two', 'three'], 2)).toEqual(['one', 'two…']);
  });

  it('leaves a list that already fits', () => {
    expect(clampLines(['one', 'two'], 2)).toEqual(['one', 'two']);
    expect(clampLines(['one'], 3)).toEqual(['one']);
  });
});
