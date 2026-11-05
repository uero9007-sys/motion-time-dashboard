// หน้า /join?code=XXXX — ปลายทางของ QR เมื่อสแกนด้วยกล้องมือถือปกติ (ไม่ได้เปิดผ่านแอป)
// ใครก็เปิดได้ จึงห้ามแสดงชื่อหรือข้อมูลใดๆ ขององค์กร แสดงแค่วิธีเข้าร่วมและรหัส
import { useState } from 'react';
import { codeFromLocation, formatInviteCode, INVITE_CODE_LENGTH, savePendingInvite } from '../lib/invite';

// กลับไปหน้าแรกของเว็บ (ตัด /join ออก) — รองรับทั้ง localhost และ GitHub Pages ที่อยู่ใต้ /motion-time-dashboard/
const homeUrl = () => window.location.origin + window.location.pathname.replace(/join\/?$/, '');

export default function JoinPage() {
  const [code] = useState(codeFromLocation);
  const [copied, setCopied] = useState(false);
  const valid = code.length === INVITE_CODE_LENGTH;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      window.prompt('คัดลอกรหัสนี้', code);
    }
  };

  const joinOnWeb = () => {
    if (valid) savePendingInvite(code);
    window.location.href = homeUrl();
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="sidebar-logo">MTS</span>
          <span className="sidebar-title">Motion &amp; Time Study</span>
        </div>
        <h1>คุณได้รับเชิญเข้าร่วมทีม</h1>

        <ol className="join-steps">
          <li>เปิดแอป <b>MTS</b> บนมือถือ แล้ว Login หรือสมัครสมาชิก</li>
          <li>ไปที่ <b>ตั้งค่า → เข้าร่วมองค์กร</b> (บัญชีใหม่จะเห็นหน้าเข้าร่วมให้เอง)</li>
          <li>กด <b>สแกน QR</b> แล้วสแกน QR เดิมอีกครั้ง หรือกรอกรหัสด้านล่าง</li>
        </ol>

        {valid ? (
          <div className="join-code-box">
            <code className="invite-code">{formatInviteCode(code)}</code>
            <button type="button" className="btn" onClick={copy}>{copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}</button>
          </div>
        ) : (
          <p className="auth-message auth-error">ลิงก์นี้ไม่มีรหัสเชิญ หรือรหัสไม่ครบ ขอ QR ใหม่จากเจ้าของทีม</p>
        )}

        <button type="button" className="btn btn-primary join-web-button" onClick={joinOnWeb}>
          เข้าร่วมผ่านเว็บ Dashboard แทน
        </button>
        <p className="auth-note">ถ้ารหัสใช้ไม่ได้ แปลว่าเจ้าของทีมสร้างรหัสใหม่แล้ว ให้ขอ QR ล่าสุด</p>
      </div>
    </div>
  );
}
