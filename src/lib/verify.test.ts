import { describe, expect, it } from 'vitest';
import { classifySignInError, isSignupConfirmationHash, VERIFY_MAX_ATTEMPTS, VERIFY_POLL_MS } from './verify';

describe('classifySignInError', () => {
  it('ยังไม่ยืนยันอีเมล → รอต่อ', () => {
    expect(classifySignInError('Email not confirmed')).toBe('waiting');
    expect(classifySignInError('email not confirmed')).toBe('waiting');
  });

  it('error อื่น → หยุดรอและแจ้งผู้ใช้', () => {
    expect(classifySignInError('Invalid login credentials')).toBe('failed');
    expect(classifySignInError('Failed to fetch')).toBe('failed');
    expect(classifySignInError('')).toBe('failed');
  });
});

describe('isSignupConfirmationHash', () => {
  it('จับเฉพาะลิงก์ยืนยันการสมัคร', () => {
    expect(isSignupConfirmationHash('#access_token=abc&refresh_token=def&type=signup')).toBe(true);
    expect(isSignupConfirmationHash('#access_token=abc&type=magiclink')).toBe(false);
    expect(isSignupConfirmationHash('#access_token=abc&type=recovery')).toBe(false);
    expect(isSignupConfirmationHash('')).toBe(false);
    expect(isSignupConfirmationHash('#error=access_denied&error_code=otp_expired')).toBe(false);
  });
});

describe('ความถี่ในการลองเข้าสู่ระบบ', () => {
  it('ไม่เกินครึ่งของเพดาน Supabase (30 ครั้ง / 5 นาที) และหยุดเองใน 10 นาที', () => {
    expect((5 * 60_000) / VERIFY_POLL_MS).toBeLessThanOrEqual(15);
    expect((VERIFY_MAX_ATTEMPTS * VERIFY_POLL_MS) / 60_000).toBe(10);
  });
});
