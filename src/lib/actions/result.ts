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

/** Turns a Postgres/Supabase error into something a traveller can read. */
export function friendlyError(error: unknown, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: string; code?: string };
    if (candidate.code === '42501') return 'คุณไม่มีสิทธิ์ทำรายการนี้';
    if (candidate.code === 'PGRST301') return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    if (candidate.message) return candidate.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
