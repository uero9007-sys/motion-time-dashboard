// วิธีใช้งาน 4 ขั้น แสดงเองครั้งแรกที่บัญชีนี้เข้า Dashboard บนเบราว์เซอร์นี้ และเปิดซ้ำได้จาก Sidebar
import { useEffect } from 'react';
import { PUBLIC_SITE_URL } from '../lib/invite';

// เรียงตามลำดับที่ทำจริง ชื่อเมนูและปุ่มในข้อความต้องตรงกับที่แสดงบนหน้าจอ
const STEPS = [
  {
    title: 'จับเวลาด้วยแอปมือถือ',
    body: 'เปิดแอป MTS บนมือถือ เข้าสู่ระบบด้วยบัญชีเดียวกันนี้ เลือก Process ใหญ่ แล้วแตะ Step เพื่อจับเวลาที่หน้างาน',
  },
  {
    title: 'ส่งผลขึ้นมาที่นี่',
    body: 'จับครบแล้วใส่ Rating และ Allowance ในแอป แล้วกดส่ง ข้อมูลจะมาปรากฏในหน้าหลักของ Dashboard ถ้ายังไม่ขึ้นให้กด "รีเฟรชข้อมูล"',
  },
  {
    title: 'ดูผลของแต่ละ Process',
    body: 'ที่หน้าหลัก เลือก Process เพื่อดูเวลาเฉลี่ย Standard Time กราฟแนวโน้ม และจำนวนรอบที่ควรจับเพิ่ม ส่งออกเป็น PDF หรือ Excel ได้',
  },
  {
    title: 'จัดสายการผลิตและชวนทีม',
    body: 'เมนู Line Balancing ใช้จัด Process ลงสถานีเทียบกับ Takt Time ส่วนเมนู สมาชิก ใช้เชิญเพื่อนร่วมงานด้วย QR หรือรหัสเชิญ',
  },
];

export default function WelcomeGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="guide-title">วิธีใช้งานใน 4 ขั้น</h2>
        <p className="guide-lede">MTS มี 2 ส่วน: แอปมือถือใช้จับเวลาที่หน้างาน และ Dashboard นี้ใช้ดูผล</p>
        <ol className="guide-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
        <p className="guide-note">
          ยังไม่มีแอป? เปิด <a href={`${PUBLIC_SITE_URL}app/`} target="_blank" rel="noreferrer">แอปเวอร์ชันเว็บ</a> บนมือถือได้เลย เปิดวิธีใช้งานนี้ซ้ำได้จากเมนูด้านซ้ายล่าง
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>เริ่มใช้งาน</button>
        </div>
      </div>
    </div>
  );
}
