import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, readThemePreference, resolveTheme, writeThemePreference } from './theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const throwingStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

describe('resolveTheme', () => {
  it('ตามระบบ ใช้ค่าจาก prefers-color-scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('เลือกเองแล้วไม่สนค่าระบบ', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('readThemePreference', () => {
  it('อ่านค่าที่บันทึกไว้', () => {
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light');
  });

  it('ไม่มีค่า ค่าเสีย หรืออ่านไม่ได้ = ตามระบบ', () => {
    expect(readThemePreference(memoryStorage())).toBe('system');
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'blue' }))).toBe('system');
    expect(readThemePreference(throwingStorage)).toBe('system');
    expect(readThemePreference(null)).toBe('system');
  });
});

describe('writeThemePreference', () => {
  it('บันทึกสว่าง/มืด และลบ key เมื่อกลับไปตามระบบ', () => {
    const storage = memoryStorage();
    writeThemePreference('dark', storage);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark');
    writeThemePreference('system', storage);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('storage ใช้ไม่ได้ก็ไม่ throw', () => {
    expect(() => writeThemePreference('light', throwingStorage)).not.toThrow();
  });
});
