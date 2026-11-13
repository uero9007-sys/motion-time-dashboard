// การยืนยันอีเมลหลังสมัคร: บอกผู้ใช้ว่ายืนยันเสร็จแล้ว ทั้งในหน้าที่ลิงก์พามา และในหน้าที่กดสมัครไว้
//
// 1) ลิงก์ยืนยันในอีเมลพามาที่ Dashboard พร้อม #access_token=...&type=signup
//    captureEmailVerified() จดไว้ก่อนที่ Supabase client จะล้าง hash แล้ว AuthGate แสดงข้อความยืนยันสำเร็จ
// 2) หน้าที่กดสมัคร (อาจเป็นอีกแท็บหรืออีกเครื่อง) ไม่ได้รับลิงก์ จึงลองเข้าสู่ระบบเป็นระยะ:
//    ยังไม่ยืนยัน Supabase ตอบ "Email not confirmed" พอยืนยันแล้วจะเข้าสู่ระบบได้และเปิด Dashboard ให้เอง

const FLAG_KEY = 'mts-email-verified';

// Supabase จำกัดการเข้าสู่ระบบราว 30 ครั้งต่อ 5 นาทีต่อ IP จึงลองห่างๆ และหยุดเองเมื่อครบ 10 นาที
export const VERIFY_POLL_MS = 20_000;
export const VERIFY_MAX_ATTEMPTS = 30;

// 'waiting' = ยังไม่ได้กดลิงก์ ให้รอต่อ, 'failed' = error อื่น ให้หยุดและแจ้งผู้ใช้
export function classifySignInError(message: string): 'waiting' | 'failed' {
  return /email not confirmed/i.test(message) ? 'waiting' : 'failed';
}

// hash ของลิงก์ยืนยันการสมัคร (ไม่ใช่ลิงก์เข้าสู่ระบบ type=magiclink หรือตั้งรหัสใหม่ type=recovery)
export const isSignupConfirmationHash = (hash: string) =>
  new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'signup';

// sessionStorage ใช้ไม่ได้ (โหมดส่วนตัวบางเบราว์เซอร์) ก็แค่ไม่มีข้อความแจ้ง การเข้าสู่ระบบยังทำงานตามปกติ
export function markEmailVerified() {
  try {
    sessionStorage.setItem(FLAG_KEY, '1');
  } catch {
    // ไม่มีที่เก็บ = ไม่แสดงข้อความ
  }
}

// เรียกใน main.tsx ก่อนโหลด AuthGate (ก่อนสร้าง Supabase client)
export function captureEmailVerified() {
  if (isSignupConfirmationHash(window.location.hash)) markEmailVerified();
}

// อ่านแล้วล้าง ข้อความจึงแสดงครั้งเดียว
export function takeEmailVerified(): boolean {
  try {
    const verified = sessionStorage.getItem(FLAG_KEY) === '1';
    if (verified) sessionStorage.removeItem(FLAG_KEY);
    return verified;
  } catch {
    return false;
  }
}

// วิธีใช้งานครั้งแรก: จำต่อบัญชีต่อเบราว์เซอร์ อ่านไม่ได้ถือว่าเคยเห็นแล้ว (เปิดดูเองได้จาก Sidebar)
const guideKey = (userId: string) => `mts-guide-seen:${userId}`;

export function hasSeenGuide(userId: string): boolean {
  try {
    return localStorage.getItem(guideKey(userId)) === '1';
  } catch {
    return true;
  }
}

export function markGuideSeen(userId: string) {
  try {
    localStorage.setItem(guideKey(userId), '1');
  } catch {
    // จำไม่ได้ก็แค่แสดงอีกครั้งในรอบหน้า
  }
}
