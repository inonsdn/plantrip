import { describe, expect, it } from 'vitest';
import {
  allocate,
  convertToBaseMinor,
  currencyDecimals,
  formatMoney,
  fromMinorUnits,
  numericToString,
  toMinorUnits,
} from '@/lib/money';

describe('minor units', () => {
  it('parses decimal strings without floating point drift', () => {
    expect(toMinorUnits('0.1', 'THB')).toBe(10);
    expect(toMinorUnits('0.07', 'THB')).toBe(7);
    expect(toMinorUnits('1234.56', 'THB')).toBe(123456);
    expect(toMinorUnits('1,234.56', 'THB')).toBe(123456);
    // 0.1 + 0.2 in floats is 0.30000000000000004; in minor units it is exact.
    expect(toMinorUnits('0.1', 'THB') + toMinorUnits('0.2', 'THB')).toBe(30);
  });

  it('respects currencies without cents', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(toMinorUnits('1500', 'JPY')).toBe(1500);
    expect(fromMinorUnits(1500, 'JPY')).toBe('1500');
    expect(currencyDecimals('KWD')).toBe(3);
    expect(toMinorUnits('1.234', 'KWD')).toBe(1234);
  });

  it('rounds deterministically, half away from zero', () => {
    expect(toMinorUnits('0.005', 'THB')).toBe(1);
    expect(toMinorUnits('0.004', 'THB')).toBe(0);
    expect(toMinorUnits('2.675', 'THB')).toBe(268);
  });

  it('formats with the trip currency symbol', () => {
    expect(formatMoney(284177, 'THB')).toBe('฿2,841.77');
    expect(formatMoney(-57119, 'THB')).toBe('-฿571.19');
    expect(formatMoney(150000, 'JPY')).toBe('¥150,000');
  });
});

describe('currency conversion', () => {
  it('converts using the stored rate and rounds once', () => {
    // 12.35 SGD at 26 THB/SGD = 321.10 THB
    expect(convertToBaseMinor('12.35', 'SGD', '26', 'THB')).toBe(32110);
    expect(convertToBaseMinor('100', 'SGD', '26', 'THB')).toBe(260000);
  });

  it('is decimal safe for rates with many places', () => {
    expect(convertToBaseMinor('1', 'JPY', '0.2345', 'THB')).toBe(23);
    expect(convertToBaseMinor('10000', 'JPY', '0.2345', 'THB')).toBe(234500);
  });

  it('keeps the base amount unchanged when the rate is 1', () => {
    expect(convertToBaseMinor('99.99', 'THB', '1', 'THB')).toBe(9999);
  });

  it('rejects a non-positive rate', () => {
    expect(() => convertToBaseMinor('10', 'SGD', '0', 'THB')).toThrow();
  });
});

describe('allocate', () => {
  it('distributes indivisible units by largest remainder, deterministically', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(100, [1, 1, 1])).toEqual(allocate(100, [1, 1, 1]));
    expect(allocate(10, [1, 1, 1, 1])).toEqual([3, 3, 2, 2]);
  });

  it('always sums back to the total', () => {
    for (const total of [1, 7, 99, 100, 1001, 123457]) {
      for (const size of [1, 2, 3, 5, 7]) {
        const parts = allocate(total, Array.from({ length: size }, () => 1));
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
      }
    }
  });

  it('honours weights', () => {
    expect(allocate(400, [2, 1, 1])).toEqual([200, 100, 100]);
    expect(allocate(100, [50, 50])).toEqual([50, 50]);
  });
});

describe('numericToString', () => {
  // PostgREST serialises Postgres `numeric` as a JSON number, so every value
  // read from the database arrives as a number even where the column holds a
  // fixed-point decimal. Anything treating one as text (.trim(), .replace())
  // throws "x.trim is not a function" at render time.
  it('converts the numbers PostgREST actually sends', () => {
    expect(numericToString(14040)).toBe('14040');
    expect(numericToString(96.5)).toBe('96.5');
    expect(numericToString(26)).toBe('26');
    expect(numericToString(0)).toBe('0');
  });

  it('passes strings through untouched', () => {
    expect(numericToString('540.00')).toBe('540.00');
    expect(numericToString('26.00000000')).toBe('26.00000000');
  });

  it('never produces exponent notation, which Decimal would reject downstream', () => {
    expect(numericToString(0.0000001)).toBe('0.0000001');
    expect(numericToString(1e-8)).toBe('0.00000001');
    expect(numericToString(1e21)).toBe('1000000000000000000000');
  });

  it('maps null and undefined to an empty string', () => {
    expect(numericToString(null)).toBe('');
    expect(numericToString(undefined)).toBe('');
  });

  it('produces values the rest of the money pipeline accepts', () => {
    const amount = numericToString(96.5);
    const rate = numericToString(26);
    expect(amount.trim()).toBe('96.5');
    expect(convertToBaseMinor(amount, 'SGD', rate, 'THB')).toBe(250900);
  });
});
