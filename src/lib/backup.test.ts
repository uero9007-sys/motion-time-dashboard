import { describe, expect, it } from 'vitest';
import { daysSince, needsBackupReminder, readLastBackup, toSheetRows, writeLastBackup } from './backup';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('backup', () => {
  it('จำวันที่สำรองแยกตามองค์กร', () => {
    const s = memoryStorage();
    expect(readLastBackup('a', s)).toBeNull();
    writeLastBackup('a', '2026-11-20T10:00:00.000Z', s);
    writeLastBackup('b', '2026-11-01T10:00:00.000Z', s);
    expect(readLastBackup('a', s)).toBe('2026-11-20T10:00:00.000Z');
    expect(readLastBackup('b', s)).toBe('2026-11-01T10:00:00.000Z');
  });

  it('ค่าเสียในเบราว์เซอร์ไม่ทำให้พัง', () => {
    const s = { getItem: () => '{not json', setItem: () => {} };
    expect(readLastBackup('a', s)).toBeNull();
    expect(() => writeLastBackup('a', '2026-11-20', s)).not.toThrow();
  });

  it('เตือนเมื่อไม่เคยสำรอง หรือสำรองครั้งล่าสุด 7 วันขึ้นไป', () => {
    const now = new Date('2026-11-24T12:00:00Z');
    expect(needsBackupReminder(null, now)).toBe(true);
    expect(daysSince('2026-11-20T12:00:00Z', now)).toBe(4);
    expect(needsBackupReminder('2026-11-20T12:00:00Z', now)).toBe(false);
    expect(needsBackupReminder('2026-11-17T12:00:00Z', now)).toBe(true);
    expect(daysSince('ไม่ใช่วันที่', now)).toBeNull();
  });

  it('object / array เป็น JSON ข้อความ ค่าอื่นคงเดิม', () => {
    expect(toSheetRows([{ id: 'x', n: 3, v: null, meta: { a: 1 }, list: [1, 2] }])).toEqual([
      { id: 'x', n: 3, v: null, meta: '{"a":1}', list: '[1,2]' },
    ]);
  });
});
