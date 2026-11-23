import { describe, expect, it } from 'vitest';
import { isNetworkError, networkErrorMessage, OFFLINE_MESSAGE, SERVER_UNREACHABLE_MESSAGE } from './network';
import { authErrorMessage } from './auth';
import { rpcErrorMessage } from './invite';

describe('network errors', () => {
  it('จับข้อความ fetch ล้มของทุกเบราว์เซอร์', () => {
    for (const m of ['TypeError: Failed to fetch', 'fetch failed', 'NetworkError when attempting to fetch resource.', 'Load failed', 'Network request failed']) {
      expect(isNetworkError(m)).toBe(true);
    }
    expect(isNetworkError('Invalid login credentials')).toBe(false);
  });

  it('ออฟไลน์ = บอกให้ตรวจเน็ต, ออนไลน์ = บอกว่าเซิร์ฟเวอร์ไม่ตอบ', () => {
    expect(networkErrorMessage(false)).toBe(OFFLINE_MESSAGE);
    expect(networkErrorMessage(true)).toBe(SERVER_UNREACHABLE_MESSAGE);
  });

  it('หน้าล็อกอินและรหัสเชิญใช้ข้อความเดียวกัน', () => {
    // ใน Node ไม่มี navigator.onLine = false จึงถือว่าออนไลน์
    expect(authErrorMessage('Failed to fetch')).toBe(SERVER_UNREACHABLE_MESSAGE);
    expect(rpcErrorMessage('TypeError: Failed to fetch')).toBe(SERVER_UNREACHABLE_MESSAGE);
    expect(authErrorMessage('Invalid login credentials')).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });
});
