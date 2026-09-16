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

  it('names the code of an error it has no words for, and nothing else', () => {
    const shown = friendlyError({
      code: '22P02',
      message: 'invalid input syntax for type uuid: "nope"',
    });
    // Still no raw database text: no column names, no constraint names, no
    // values. Only the code, which identifies the fault and nothing about the
    // data — and without which a failure in production cannot be diagnosed.
    expect(shown).not.toContain('invalid input syntax');
    expect(shown).not.toContain('nope');
    expect(shown).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง (22P02)');
  });

  it('keeps the caller\'s own wording in front of the code', () => {
    const shown = friendlyError({ code: 'PGRST204', message: "Column 'notes' not found" }, 'บันทึกการเดินทางไม่สำเร็จ');
    expect(shown).toBe('บันทึกการเดินทางไม่สำเร็จ (PGRST204)');
    expect(shown).not.toContain('notes');
  });

  it('never decorates a message we wrote ourselves', () => {
    const shown = friendlyError(
      { code: '40001', message: 'มีคนแก้ไขแผนวันนี้ไปแล้ว กรุณาโหลดใหม่แล้วลองอีกครั้ง' },
      'บันทึกไม่สำเร็จ',
    );
    expect(shown).toBe('มีคนแก้ไขแผนวันนี้ไปแล้ว กรุณาโหลดใหม่แล้วลองอีกครั้ง');
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
