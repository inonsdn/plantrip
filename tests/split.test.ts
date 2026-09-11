import { describe, expect, it } from 'vitest';
import { computeSplits, SplitError } from '@/lib/split';
import { toMinorUnits } from '@/lib/money';

const NON = 'non';
const MEW = 'mew';
const PRAEW = 'praew';
const THREE = [{ memberId: NON }, { memberId: MEW }, { memberId: PRAEW }];

function total(lines: { amountMinor: number }[]): number {
  return lines.reduce((sum, line) => sum + line.amountMinor, 0);
}

describe('equal split', () => {
  it('splits evenly when the amount divides', () => {
    const lines = computeSplits('equal', 30000, THREE);
    expect(lines.map((line) => line.amountMinor)).toEqual([10000, 10000, 10000]);
  });

  it('handles indivisible cents without losing or inventing money', () => {
    const lines = computeSplits('equal', 10000, THREE);
    expect(lines.map((line) => line.amountMinor)).toEqual([3334, 3333, 3333]);
    expect(total(lines)).toBe(10000);
  });

  it('is deterministic across runs', () => {
    const first = computeSplits('equal', 10_001, THREE).map((line) => line.amountMinor);
    const second = computeSplits('equal', 10_001, THREE).map((line) => line.amountMinor);
    expect(first).toEqual(second);
    expect(first.reduce((a, b) => a + b, 0)).toBe(10_001);
  });

  it('rejects an empty participant list', () => {
    expect(() => computeSplits('equal', 1000, [])).toThrow(SplitError);
  });
});

describe('exact split', () => {
  it('accepts amounts that add up to the total', () => {
    const lines = computeSplits('exact', 10000, [
      { memberId: NON, value: 5000 },
      { memberId: MEW, value: 3000 },
      { memberId: PRAEW, value: 2000 },
    ]);
    expect(lines.map((line) => line.amountMinor)).toEqual([5000, 3000, 2000]);
    expect(total(lines)).toBe(10000);
  });

  it('rejects amounts that do not add up', () => {
    expect(() =>
      computeSplits('exact', 10000, [
        { memberId: NON, value: 5000 },
        { memberId: MEW, value: 4000 },
      ]),
    ).toThrow(/ยอดรวม/);
  });
});

describe('percentage split', () => {
  it('splits by percent and absorbs rounding', () => {
    const lines = computeSplits('percent', 10000, [
      { memberId: NON, value: 50 },
      { memberId: MEW, value: 25 },
      { memberId: PRAEW, value: 25 },
    ]);
    expect(lines.map((line) => line.amountMinor)).toEqual([5000, 2500, 2500]);
  });

  it('keeps the total exact with repeating decimals', () => {
    const lines = computeSplits('percent', 10000, [
      { memberId: NON, value: '33.33' },
      { memberId: MEW, value: '33.33' },
      { memberId: PRAEW, value: '33.34' },
    ]);
    expect(total(lines)).toBe(10000);
  });

  it('rejects percentages that do not add up to 100', () => {
    expect(() =>
      computeSplits('percent', 10000, [
        { memberId: NON, value: 50 },
        { memberId: MEW, value: 40 },
      ]),
    ).toThrow(/100%/);
  });
});

describe('share-unit split', () => {
  it('splits 2:1:1', () => {
    const lines = computeSplits('shares', 40000, [
      { memberId: NON, value: 2 },
      { memberId: MEW, value: 1 },
      { memberId: PRAEW, value: 1 },
    ]);
    expect(lines.map((line) => line.amountMinor)).toEqual([20000, 10000, 10000]);
  });

  it('handles shares that do not divide evenly', () => {
    const lines = computeSplits('shares', 10000, [
      { memberId: NON, value: 2 },
      { memberId: MEW, value: 1 },
    ]);
    expect(total(lines)).toBe(10000);
    expect(lines[0].amountMinor).toBe(6667);
    expect(lines[1].amountMinor).toBe(3333);
  });

  it('rejects non-positive shares', () => {
    expect(() =>
      computeSplits('shares', 10000, [
        { memberId: NON, value: 0 },
        { memberId: MEW, value: 1 },
      ]),
    ).toThrow(/สัดส่วน/);
  });
});

describe('personal expense', () => {
  it('assigns the whole amount to one member', () => {
    const lines = computeSplits('personal', 45000, [{ memberId: MEW }]);
    expect(lines).toHaveLength(1);
    expect(lines[0].amountMinor).toBe(45000);
  });

  it('rejects more than one member', () => {
    expect(() => computeSplits('personal', 45000, THREE)).toThrow(/คนเดียว/);
  });
});

describe('multi-currency amounts feed the split correctly', () => {
  it('splits a converted SGD amount three ways', () => {
    // 100 SGD at 26 = 2,600 THB
    const totalMinor = toMinorUnits('2600', 'THB');
    const lines = computeSplits('equal', totalMinor, THREE);
    expect(total(lines)).toBe(totalMinor);
    expect(lines.map((line) => line.amountMinor)).toEqual([86667, 86667, 86666]);
  });
});

describe('duplicate members', () => {
  it('is rejected', () => {
    expect(() =>
      computeSplits('equal', 1000, [{ memberId: NON }, { memberId: NON }]),
    ).toThrow(/ซ้ำ/);
  });
});
