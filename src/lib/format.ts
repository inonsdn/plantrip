/**
 * Thai date formatting.
 *
 * Deliberately not using Intl: `th-TH` abbreviations differ between Node's ICU
 * build and the browser's, which produced hydration mismatches. Fixed tables
 * render identically on the server and the client.
 */

const MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** Gregorian year -> Buddhist Era, which is what Thai users expect to read. */
function buddhistYear(year: number): number {
  return year + 543;
}

/** `2025-03-14` -> Date at local midnight (no timezone drift). */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

/** `14 มี.ค. 2568` */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDateOnly(value);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${buddhistYear(date.getFullYear())}`;
}

/** `14 มี.ค.` */
export function formatDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDateOnly(value);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** `ศ. 14 มี.ค.` */
export function formatDateWithWeekday(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDateOnly(value);
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'ยังไม่ระบุวันเดินทาง';
  if (start && !end) return `เริ่ม ${formatDate(start)}`;
  if (!start && end) return `ถึง ${formatDate(end)}`;
  return `${formatDateShort(start)} – ${formatDate(end)}`;
}

/** `14 มี.ค. 2568 10:30 น.` — rendered from the viewer's local time. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${buddhistYear(date.getFullYear())} ${time} น.`;
}

/** 1-based trip day for an expense date, or null when the trip has no start. */
export function tripDayFor(expenseDate: string, startDate: string | null): number | null {
  if (!startDate) return null;
  const start = parseDateOnly(startDate).getTime();
  const current = parseDateOnly(expenseDate).getTime();
  const diff = Math.round((current - start) / 86_400_000);
  return diff >= 0 ? diff + 1 : null;
}

export function tripDayLabel(day: number | null): string {
  if (day === null || day === undefined) return 'ก่อน/นอกช่วงทริป';
  if (day === 0) return 'ก่อนเดินทาง';
  return `วันที่ ${day}`;
}
