export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = undefined>(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/** SQLSTATE codes a traveller might actually hit, in words they can act on. */
const DATABASE_MESSAGES: Record<string, string> = {
  '23505': 'มีรายการนี้อยู่แล้ว',
  '23503': 'ข้อมูลที่อ้างถึงไม่ได้อยู่ในทริปนี้',
  '23514': 'ข้อมูลไม่ถูกต้องตามเงื่อนไขของระบบ',
  '42501': 'คุณไม่มีสิทธิ์ทำรายการนี้',
  PGRST301: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
};

/** Our own database functions raise Thai; Postgres raises English. */
function isOwnMessage(message: string): boolean {
  return /[\u0E00-\u0E7F]/.test(message);
}

/**
 * Turns a Postgres/Supabase error into something a traveller can read.
 * Never surfaces raw database text such as a constraint name.
 */
export function friendlyError(error: unknown, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: string; code?: string };
    if (candidate.message && isOwnMessage(candidate.message)) return candidate.message;
    if (candidate.code && DATABASE_MESSAGES[candidate.code]) {
      return DATABASE_MESSAGES[candidate.code];
    }
    if (candidate.code) return fallback;
    if (candidate.message) return candidate.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
