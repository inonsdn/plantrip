import { describe, expect, it } from 'vitest';
import { friendlyError } from '@/lib/actions/result';

describe('friendlyError', () => {
  // A constraint name reached a traveller's screen once; it must not again.
  it('never surfaces raw Postgres text', () => {
    const raw = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "settlements_expense_pair_unique"',
    };
    const shown = friendlyError(raw);
    expect(shown).not.toContain('settlements_expense_pair_unique');
    expect(shown).not.toContain('duplicate key');
    expect(shown).toBe('มีรายการนี้อยู่แล้ว');
  });

  it('falls back to a generic message for an unmapped database error', () => {
    const shown = friendlyError({
      code: '22P02',
      message: 'invalid input syntax for type uuid: "nope"',
    });
    expect(shown).not.toContain('invalid input syntax');
    expect(shown).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  });

  it('keeps the Thai messages our own database functions raise', () => {
    expect(
      friendlyError({
        code: '42501',
        message: 'ต้องให้ผู้รับเงินเป็นคนยืนยันว่าได้รับแล้ว',
      }),
    ).toBe('ต้องให้ผู้รับเงินเป็นคนยืนยันว่าได้รับแล้ว');
  });

  it('maps the permission and session codes', () => {
    expect(friendlyError({ code: '42501', message: 'permission denied' })).toBe(
      'คุณไม่มีสิทธิ์ทำรายการนี้',
    );
    expect(friendlyError({ code: 'PGRST301', message: 'JWT expired' })).toBe(
      'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    );
  });

  it('passes through a plain Error and uses the fallback otherwise', () => {
    expect(friendlyError(new Error('บันทึกไม่สำเร็จ'))).toBe('บันทึกไม่สำเร็จ');
    expect(friendlyError(null, 'ลองใหม่')).toBe('ลองใหม่');
  });
});
