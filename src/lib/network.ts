// แยก "เครื่องไม่ได้ต่อเน็ต" ออกจาก "เน็ตใช้ได้ แต่เซิร์ฟเวอร์ข้อมูลไม่ตอบ"
// เดิมทั้งสองกรณีขึ้นว่า "เชื่อมต่ออินเทอร์เน็ตไม่ได้" ทำให้เข้าใจผิดตอนที่ Supabase แผนฟรีพักโปรเจกต์เอง
// (ไม่มีคนใช้ ~7 วัน → ชื่อโดเมนของโปรเจกต์หายไป → fetch ล้มทั้งที่เน็ตปกติ)

export const OFFLINE_MESSAGE = 'เครื่องนี้ไม่ได้เชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบเน็ตแล้วลองใหม่';
export const SERVER_UNREACHABLE_MESSAGE =
  'ติดต่อเซิร์ฟเวอร์ข้อมูลไม่ได้ (เน็ตของคุณใช้ได้ปกติ) ระบบฐานข้อมูลอาจถูกพักชั่วคราว กรุณาแจ้งผู้ดูแลระบบ หรือลองใหม่ภายหลัง';

// ข้อความ error ของ fetch ที่ล้มก่อนได้คำตอบจากเซิร์ฟเวอร์ (Chrome / Firefox / Safari / Node)
export function isNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('fetch failed') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('network')
  );
}

function browserOnline(): boolean {
  // navigator.onLine = false แน่ใจได้ว่าไม่มีเน็ต ส่วน true แปลว่า "น่าจะมี" (ไม่มี navigator ถือว่าออนไลน์)
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function networkErrorMessage(online: boolean = browserOnline()): string {
  return online ? SERVER_UNREACHABLE_MESSAGE : OFFLINE_MESSAGE;
}

// error อื่นที่ไม่ใช่เรื่องเน็ต คืนข้อความเดิม
export function describeError(message: string): string {
  return isNetworkError(message) ? networkErrorMessage() : message;
}
