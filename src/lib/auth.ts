// บทบาทและสิทธิ์ของสมาชิกในบริษัท (ต้องตรงกับ type public.org_role ใน Supabase)
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export type Membership = { id: string; name: string; role: OrgRole };

// ข้อมูลบัญชีที่ Login อยู่ ส่งจาก AuthGate ลงไปให้ Sidebar และหน้าสมาชิก
export type Account = {
  email: string;
  // ชื่อจากตาราง profiles (ว่าง = ยังไม่ได้ตั้งชื่อ หรือยังไม่ได้รัน migration ขั้นที่ 5)
  fullName: string;
  memberships: Membership[];
  onSwitchOrganization: (organizationId: string) => void;
  onSignOut: () => void;
  onMembershipsChanged: () => void;
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export const ROLE_HINTS: Record<OrgRole, string> = {
  owner: 'จัดการได้ทุกอย่าง รวมถึงแต่งตั้ง Owner',
  admin: 'จัดการสมาชิกและข้อมูลได้',
  member: 'ดูและบันทึก/แก้ไขข้อมูลได้',
  viewer: 'ดูได้อย่างเดียว',
};

// โหมดทดลอง: ตั้ง VITE_SKIP_LOGIN=true ใน .env เพื่อเปิด Dashboard โดยไม่ต้อง Login
// ใช้ได้เฉพาะตอนที่ Supabase ยังไม่ได้เปิด RLS (ยังไม่ได้รัน 20261002000003_enable_rls.sql) เพราะ anon จะอ่านข้อมูลไม่ได้
export const SKIP_LOGIN = import.meta.env.VITE_SKIP_LOGIN === 'true';

// VITE_ORG_ID ว่าง = ไม่กรองตามบริษัท (ใช้กับฐานข้อมูลที่ยังไม่มีคอลัมน์ organization_id)
export const TEST_ORGANIZATION: Membership = {
  id: import.meta.env.VITE_ORG_ID ?? '',
  name: 'โหมดทดลอง (ไม่ได้ Login)',
  role: 'owner',
};

export const canEditData =(role: OrgRole) => role !== 'viewer';
export const canManageMembers = (role: OrgRole) => role === 'owner' || role === 'admin';

// หลังกดลิงก์ในอีเมลหรือ Login ด้วย Google ให้กลับมาที่หน้านี้ (รองรับ GitHub Pages ที่อยู่ใต้ path ของ repo)
export const authRedirectUrl = () => window.location.origin + window.location.pathname;

const ORG_STORAGE_KEY = 'mts-selected-organization';

export function loadSelectedOrgId(): string | null {
  try {
    return localStorage.getItem(ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedOrgId(id: string) {
  try {
    localStorage.setItem(ORG_STORAGE_KEY, id);
  } catch {
    // เบราว์เซอร์ไม่อนุญาตให้บันทึก — ครั้งหน้าจะเปิดบริษัทแรกแทน
  }
}

// ต้องตรงกับ Minimum password length ใน Supabase → Authentication → Providers → Email
export const MIN_PASSWORD_LENGTH = 8;

// แปลข้อความ error ที่พบบ่อยจาก Supabase Auth เป็นภาษาไทย
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (m.includes('email not confirmed')) return 'ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ยืนยันในอีเมลก่อน';
  if (m.includes('user already registered')) return 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"';
  if (m.includes('password should be') || m.includes('weak password')) return `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`;
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes'))
    return 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (m.includes('provider is not enabled')) return 'ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วยวิธีนี้ (ต้องตั้งค่าใน Supabase)';
  if (m.includes('signups not allowed')) return 'อีเมลนี้ยังไม่มีบัญชีในระบบ';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
    return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเน็ตแล้วลองใหม่';
  if (m.includes('database error saving new user'))
    return 'สมัครไม่สำเร็จ: ฐานข้อมูลยังไม่พร้อม (ผู้ดูแลต้องรัน migration ขั้นที่ 5 ก่อน)';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'รูปแบบอีเมลไม่ถูกต้อง';
  return message;
}
