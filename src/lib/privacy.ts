// หน้านโยบายความเป็นส่วนตัว (PDPA) — เปิดได้โดยไม่ต้อง Login ที่ /privacy
// GitHub Pages ส่ง 404.html (สำเนาของ index.html) ให้ทุก path ที่ไม่มีไฟล์จริง เหมือนหน้า /join

export const isPrivacyPath = (pathname: string) => /\/privacy\/?$/.test(pathname);

// ลิงก์ไปหน้านโยบาย ใช้ base ของ Vite ('/' ตอน dev, '/motion-time-dashboard/' ตอน build)
export const privacyUrl = (base: string = import.meta.env.BASE_URL) => `${base.replace(/\/?$/, '/')}privacy`;

// ค่าที่เก็บใน user metadata ตอนสมัคร (privacy_accepted_at) เป็นหลักฐานการให้ความยินยอม
export const consentTimestamp = (now: Date = new Date()) => now.toISOString();
