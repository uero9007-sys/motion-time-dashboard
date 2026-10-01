// การตั้งค่า Dashboard เก็บในเบราว์เซอร์ของผู้ใช้แต่ละคน (localStorage)
import type { Page } from '../types';

export type FontScale = 1 | 1.1 | 1.2;

export type DashboardSettings = {
  confidence: number;
  errorPercent: number;
  shiftMinutes: number;
  cvStable: number;
  cvWatch: number;
  fontScale: FontScale;
  startPage: Page;
};

export const DEFAULT_SETTINGS: DashboardSettings = {
  confidence: 95,
  errorPercent: 5,
  shiftMinutes: 480,
  cvStable: 10,
  cvWatch: 20,
  fontScale: 1,
  startPage: 'home',
};

const STORAGE_KEY = 'mts-dashboard-settings';
export const LINE_BALANCE_STORAGE_KEY = 'mts-line-balance';

export function loadSettings(): DashboardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DashboardSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: DashboardSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // เบราว์เซอร์ไม่อนุญาตให้บันทึก — ใช้ค่าในหน้านี้ต่อได้ แค่ไม่จำหลังรีเฟรช
  }
}
