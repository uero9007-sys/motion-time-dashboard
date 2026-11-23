// สถานะธีมฝั่งเบราว์เซอร์: ค่าที่ผู้ใช้เลือก + ค่าระบบ (prefers-color-scheme) → data-theme บน <html>
// ทุกคอมโพเนนต์อ่านผ่าน hook ด้านล่าง เปลี่ยนธีมแล้ว (รวมถึงระบบเปลี่ยนเองตอนเลือก "ตามระบบ") หน้าจะ render ใหม่ทันที
import { useSyncExternalStore } from 'react';
import {
  THEME_COLOR,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './lib/theme';

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

let preference: ThemePreference = readThemePreference();
let resolved: ResolvedTheme = resolveTheme(preference, media?.matches ?? false);
const listeners = new Set<() => void>();

function apply() {
  resolved = resolveTheme(preference, media?.matches ?? false);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
  listeners.forEach((l) => l());
}

if (typeof document !== 'undefined') {
  apply();
  media?.addEventListener('change', apply);
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  writeThemePreference(next);
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference, () => preference);
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, () => resolved, () => resolved);
}
