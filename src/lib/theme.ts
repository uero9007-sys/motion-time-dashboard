// ธีมสว่าง / มืด ของ Dashboard
// ผู้ใช้เลือกได้ 3 แบบ: ตามระบบ (ค่าเริ่มต้น) / สว่าง / มืด  เก็บใน localStorage แล้วใส่ data-theme ที่ <html>
// สคริปต์สั้นใน index.html ทำแบบเดียวกันก่อนวาดหน้าแรก (กันจอขาวแวบ) ถ้าแก้ key หรือค่า ต้องแก้ที่นั่นด้วย

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mts-theme';

// สีแถบเบราว์เซอร์ (meta theme-color): สว่าง = สี action เดิมใน index.html, มืด = สีพื้นหลัง
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#0E6B66', dark: '#0F1A1D' };

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// ค่าเสีย / อ่านไม่ได้ (โหมดส่วนตัว, ถูกบล็อก) = ตามระบบ
export function readThemePreference(storage: StorageLike | null = defaultStorage()): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

// "ตามระบบ" ไม่ต้องเก็บค่า จึงลบ key ทิ้ง
export function writeThemePreference(preference: ThemePreference, storage: StorageLike | null = defaultStorage()): void {
  try {
    if (preference === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // บันทึกไม่ได้ก็ยังใช้ธีมที่เลือกได้จนปิดหน้า
  }
}
