import { describe, expect, it } from 'vitest';
import { isMissingTable, layoutToData, rowToLayout } from './teamLayouts';

describe('team layouts', () => {
  it('รู้ว่ายังไม่ได้สร้างตาราง (ยังไม่รัน migration 9)', () => {
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.line_layouts' in the schema cache" })).toBe(true);
    expect(isMissingTable({ code: '42P01', message: 'relation "public.line_layouts" does not exist' })).toBe(true);
    expect(isMissingTable({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });

  it('แปลงแถวจากฐานข้อมูลเป็นผัง', () => {
    const l = rowToLayout({
      id: 'x', name: 'ก่อนปรับปรุง', updated_at: '2026-11-24T10:00:00Z',
      data: { basis: 'standard', lastN: 5, takt: 32, availableSec: 28800, stations: [{ id: 's1', processKeys: ['g1', 'g2'] }] },
    });
    expect(l).toEqual({
      id: 'x', name: 'ก่อนปรับปรุง', savedAt: '2026-11-24T10:00:00Z',
      basis: 'standard', lastN: 5, takt: 32, availableSec: 28800, stations: [{ id: 's1', processKeys: ['g1', 'g2'] }],
    });
  });

  it('ข้อมูลเสียไม่ทำให้หน้าพัง: ข้ามแถว หรือใช้ค่าปลอดภัย', () => {
    expect(rowToLayout({ id: 'x', name: 'a', updated_at: '', data: null })).toBeNull();
    expect(rowToLayout({ id: 'x', name: 'a', updated_at: '', data: { stations: 'nope' } })).toBeNull();
    const l = rowToLayout({ id: 'x', name: 'a', updated_at: '', data: { basis: 'weird', takt: 'abc', stations: [{ id: 's1', processKeys: ['g1'] }, { id: 2 }, null] } });
    expect(l?.basis).toBe('observed');
    expect(l?.takt).toBeNull();
    expect(l?.stations).toEqual([{ id: 's1', processKeys: ['g1'] }]);
  });

  it('ส่งเฉพาะข้อมูลผัง ไม่ส่ง id / ชื่อ ซ้ำในคอลัมน์ data', () => {
    const data = layoutToData({ id: 'x', name: 'n', savedAt: 's', basis: 'observed', lastN: null, takt: null, availableSec: null, stations: [] } as never);
    expect(Object.keys(data).sort()).toEqual(['availableSec', 'basis', 'lastN', 'stations', 'takt']);
  });
});
