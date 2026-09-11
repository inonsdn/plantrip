import Decimal from 'decimal.js';

// Deterministic rounding everywhere: half away from zero, no floating point.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/** Currencies whose minor unit is not 1/100. */
const CURRENCY_DECIMALS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  IDR: 0,
  TWD: 0,
  CLP: 0,
  ISK: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  THB: '฿',
  SGD: 'S$',
  JPY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  KRW: '₩',
  CNY: 'CN¥',
  HKD: 'HK$',
  TWD: 'NT$',
  MYR: 'RM',
  VND: '₫',
  AUD: 'A$',
  IDR: 'Rp',
  INR: '₹',
  CHF: 'CHF ',
  PHP: '₱',
  LAK: '₭',
  KHR: '៛',
  MMK: 'K',
};

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

export function currencySymbol(currency: string): string {
  const code = currency.toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

function factor(currency: string): Decimal {
  return new Decimal(10).pow(currencyDecimals(currency));
}

/**
 * Parse a user-supplied amount into integer minor units.
 * Accepts `1,234.50`, `1234.5`, numbers and Decimals. Throws on garbage.
 */
export function toMinorUnits(value: string | number | Decimal, currency: string): number {
  const raw = typeof value === 'string' ? value.replace(/[,\s]/g, '') : value;
  if (raw === '' || raw === null || raw === undefined) {
    throw new MoneyError('จำนวนเงินไม่ถูกต้อง');
  }
  let decimal: Decimal;
  try {
    decimal = new Decimal(raw);
  } catch {
    throw new MoneyError('จำนวนเงินไม่ถูกต้อง');
  }
  if (!decimal.isFinite()) throw new MoneyError('จำนวนเงินไม่ถูกต้อง');
  return decimal.times(factor(currency)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Minor units back to a plain decimal string, e.g. `2841.77`. */
export function fromMinorUnits(minor: number, currency: string): string {
  return new Decimal(minor).dividedBy(factor(currency)).toFixed(currencyDecimals(currency));
}

/**
 * Convert an amount in `fromCurrency` into the trip base currency.
 * `rate` is "how many base units one unit of fromCurrency is worth".
 */
export function convertToBaseMinor(
  originalAmount: string | number | Decimal,
  fromCurrency: string,
  rate: string | number | Decimal,
  baseCurrency: string,
): number {
  const amount = new Decimal(
    typeof originalAmount === 'string' ? originalAmount.replace(/[,\s]/g, '') : originalAmount,
  );
  const exchangeRate = new Decimal(typeof rate === 'string' ? rate.replace(/[,\s]/g, '') : rate);
  if (!amount.isFinite() || !exchangeRate.isFinite()) {
    throw new MoneyError('จำนวนเงินหรืออัตราแลกเปลี่ยนไม่ถูกต้อง');
  }
  if (exchangeRate.lessThanOrEqualTo(0)) {
    throw new MoneyError('อัตราแลกเปลี่ยนต้องมากกว่า 0');
  }
  // Round once, at the end, to the base currency's smallest unit.
  return amount
    .times(exchangeRate)
    .times(factor(baseCurrency))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function sumMinor(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Split `totalMinor` across `weights` using the largest-remainder method.
 *
 * Deterministic: leftover minor units go to the largest fractional remainder,
 * ties broken by position, so the same input always produces the same output.
 */
export function allocate(totalMinor: number, weights: readonly (number | string | Decimal)[]): number[] {
  if (weights.length === 0) throw new MoneyError('ต้องมีผู้ร่วมจ่ายอย่างน้อย 1 คน');

  const decimalWeights = weights.map((weight) => new Decimal(weight));
  if (decimalWeights.some((weight) => weight.lessThan(0))) {
    throw new MoneyError('สัดส่วนต้องไม่ติดลบ');
  }
  const weightTotal = decimalWeights.reduce((total, weight) => total.plus(weight), new Decimal(0));
  if (weightTotal.isZero()) throw new MoneyError('สัดส่วนรวมต้องมากกว่า 0');

  const exact = decimalWeights.map((weight) => new Decimal(totalMinor).times(weight).dividedBy(weightTotal));
  const floored = exact.map((value) => value.floor());
  let remainder = new Decimal(totalMinor).minus(
    floored.reduce((total, value) => total.plus(value), new Decimal(0)),
  );

  const order = exact
    .map((value, index) => ({ index, fraction: value.minus(floored[index]) }))
    .sort((a, b) => {
      const diff = b.fraction.comparedTo(a.fraction);
      return diff !== 0 ? diff : a.index - b.index;
    });

  const result = floored.map((value) => value.toNumber());
  let cursor = 0;
  while (remainder.greaterThan(0) && order.length > 0) {
    result[order[cursor % order.length].index] += 1;
    remainder = remainder.minus(1);
    cursor += 1;
  }
  return result;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Thousand separators without Intl, so the server and client always agree. */
function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `formatMoney(284177, 'THB') === '฿2,841.77'` */
export function formatMoney(
  minor: number,
  currency: string,
  options: { withSymbol?: boolean; signDisplay?: 'auto' | 'never' } = {},
): string {
  const { withSymbol = true, signDisplay = 'auto' } = options;
  const decimals = currencyDecimals(currency);
  const absolute = Math.abs(minor);
  const fixed = fromMinorUnits(absolute, currency);
  const [whole, fraction] = fixed.split('.');
  const body = decimals > 0 ? `${groupDigits(whole)}.${fraction}` : groupDigits(whole);
  const sign = signDisplay === 'never' || minor >= 0 ? '' : '-';
  return withSymbol ? `${sign}${currencySymbol(currency)}${body}` : `${sign}${body}`;
}
