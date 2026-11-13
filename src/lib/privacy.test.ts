import { describe, expect, it } from 'vitest';
import { consentTimestamp, isPrivacyPath, privacyUrl } from './privacy';

describe('isPrivacyPath', () => {
  it('รู้จัก /privacy ทั้งตอน dev และใต้ base ของ GitHub Pages', () => {
    expect(isPrivacyPath('/privacy')).toBe(true);
    expect(isPrivacyPath('/privacy/')).toBe(true);
    expect(isPrivacyPath('/motion-time-dashboard/privacy')).toBe(true);
  });

  it('ไม่ตรงกับ path อื่น', () => {
    expect(isPrivacyPath('/')).toBe(false);
    expect(isPrivacyPath('/motion-time-dashboard/')).toBe(false);
    expect(isPrivacyPath('/join')).toBe(false);
    expect(isPrivacyPath('/privacy-old')).toBe(false);
  });
});

describe('privacyUrl', () => {
  it('ต่อท้าย base เสมอ ไม่ว่า base จะมี / ปิดท้ายหรือไม่', () => {
    expect(privacyUrl('/')).toBe('/privacy');
    expect(privacyUrl('/motion-time-dashboard/')).toBe('/motion-time-dashboard/privacy');
    expect(privacyUrl('/motion-time-dashboard')).toBe('/motion-time-dashboard/privacy');
  });
});

describe('consentTimestamp', () => {
  it('เป็น ISO string', () => {
    expect(consentTimestamp(new Date(Date.UTC(2026, 10, 13, 3, 4, 5)))).toBe('2026-11-13T03:04:05.000Z');
  });
});
