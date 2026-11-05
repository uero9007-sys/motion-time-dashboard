// รหัสเชิญเข้าองค์กร (QR Code) — ต้องตรงกับ generate_invite_code / normalize_invite_code ใน migration ขั้นที่ 6
// และกับ lib/invite.ts ของแอปมือถือ

// ที่อยู่เว็บจริง ใช้ใน QR เสมอ (แม้เปิดจาก localhost) เพราะมือถือของคนอื่นเปิด localhost ของเราไม่ได้
// และแอปมือถือยอมรับเฉพาะ QR ที่ชี้มาโดเมนนี้
export const PUBLIC_SITE_URL = 'https://uero9007-sys.github.io/motion-time-dashboard/';

export const INVITE_CODE_LENGTH = 10;

// ตัดช่องว่างและขีด แปลงเป็นตัวใหญ่ (คนพิมพ์ ABCDE-FGHJK หรือ abcde fghjk ก็ได้)
export const normalizeInviteCode = (code: string) => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// แสดงเป็น 2 กลุ่มให้อ่านง่าย: ABCDE-FGHJK
export const formatInviteCode = (code: string) => {
  const c = normalizeInviteCode(code);
  return c.length === INVITE_CODE_LENGTH ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
};

// เนื้อหาใน QR เป็น URL (ไม่ใช่รหัสดิบ) คนที่สแกนด้วยกล้องปกติจะได้หน้า /join ที่อธิบายวิธีเข้าร่วม
export const inviteUrl = (code: string) => `${PUBLIC_SITE_URL}join?code=${normalizeInviteCode(code)}`;

// หน้า /join (หรือ /join?code=...) — GitHub Pages ส่ง 404.html (สำเนาของ index.html) ให้ทุก path ที่ไม่มีไฟล์จริง
export const isJoinPath = (pathname: string) => /\/join\/?$/.test(pathname);

export const codeFromLocation = () => {
  const code = new URLSearchParams(window.location.search).get('code');
  return code ? normalizeInviteCode(code) : '';
};

// รหัสที่ได้จาก /join เก็บไว้ระหว่างสมัคร/เข้าสู่ระบบ แล้ว AuthGate นำไปใช้ให้อัตโนมัติ
const PENDING_KEY = 'mts-pending-invite';

export function savePendingInvite(code: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, normalizeInviteCode(code));
  } catch {
    // เบราว์เซอร์ไม่อนุญาต — ผู้ใช้กรอกรหัสเองในหน้าเข้าร่วมได้
  }
}

export function takePendingInvite(): string {
  try {
    const code = sessionStorage.getItem(PENDING_KEY) ?? '';
    sessionStorage.removeItem(PENDING_KEY);
    return code;
  } catch {
    return '';
  }
}

export function peekPendingInvite(): string {
  try {
    return sessionStorage.getItem(PENDING_KEY) ?? '';
  } catch {
    return '';
  }
}

export type JoinResult =
  | { ok: true; organizationId: string; organizationName: string }
  | { ok: false; reason: string; organizationId?: string; organizationName?: string };

// ผลจาก RPC join_organization (คืน jsonb) แปลงเป็น type ของแอป
export function parseJoinResult(data: unknown): JoinResult {
  const d = (data ?? {}) as { ok?: boolean; reason?: string; organization_id?: string; organization_name?: string };
  if (d.ok) return { ok: true, organizationId: d.organization_id ?? '', organizationName: d.organization_name ?? '' };
  return { ok: false, reason: d.reason ?? 'unknown', organizationId: d.organization_id, organizationName: d.organization_name };
}

export function joinErrorMessage(result: Extract<JoinResult, { ok: false }>): string {
  switch (result.reason) {
    case 'invalid_code':
      return 'รหัสเชิญไม่ถูกต้อง หรือเจ้าขององค์กรสร้างรหัสใหม่แล้ว ขอรหัสล่าสุดจากเจ้าขององค์กร';
    case 'already_member':
      return `คุณเป็นสมาชิกของ "${result.organizationName}" อยู่แล้ว`;
    case 'too_many_attempts':
      return 'กรอกรหัสผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่';
    case 'not_authenticated':
      return 'กรุณาเข้าสู่ระบบก่อน';
    default:
      return 'เข้าร่วมไม่สำเร็จ กรุณาลองใหม่';
  }
}

// error ของ RPC เอง (ไม่ใช่ผลลัพธ์ ok:false) เช่น เน็ตหลุด หรือยังไม่ได้รัน migration ขั้นที่ 6
export function rpcErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
    return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเน็ตแล้วลองใหม่';
  if (m.includes('could not find the function') || m.includes('does not exist') || m.includes('invite_code'))
    return 'ระบบรหัสเชิญยังไม่พร้อม (ผู้ดูแลต้องรัน migration ขั้นที่ 6 ก่อน)';
  return message;
}
