// โครงหน้าที่ใช้ก่อนเข้าระบบ (เข้าสู่ระบบ / สมัคร / ยังไม่มีทีม / หน้า join)
// ฟอร์มชิดซ้าย ส่วนที่ว่างบนจอกว้างแสดงใบบันทึกการจับเวลาตัวอย่าง (ซ่อนบนจอแคบด้วย CSS)
import type { ReactNode } from 'react';

// เวลาที่จับได้ต่อรอบ (วินาที) ของงานตัวอย่าง ค่าเฉลี่ย / Normal time / Standard time คำนวณจากตัวเลขชุดนี้
const SAMPLE_ROUNDS = 5;
const SAMPLE_ALLOWANCE_PERCENT = 10;
const SAMPLE_STEPS: { name: string; readings: number[]; rating: number }[] = [
  { name: 'หยิบฝาครอบจากถาด', readings: [2.1, 2.25, 2.05, 2.18, 2.12], rating: 100 },
  { name: 'วางฝาครอบลงบนจิ๊ก', readings: [3.42, 3.3, 3.55, 3.38, 3.45], rating: 105 },
  { name: 'ใส่สกรู 4 ตัว', readings: [6.8, 7.05, 6.92, 7.3, 6.88], rating: 95 },
  { name: 'ขันสกรูด้วยไขควงลม', readings: [8.15, 8.02, 8.4, 8.21, 8.12], rating: 100 },
  { name: 'ตรวจด้วยสายตา', readings: [2.6, 2.48, 2.75, 2.55, 2.62], rating: 100 },
  { name: 'วางชิ้นงานลงกล่อง', readings: [1.85, 1.92, 1.8, 1.88, 1.9], rating: 110 },
];

function SampleObservationSheet() {
  const rows = SAMPLE_STEPS.map((step) => {
    const mean = step.readings.reduce((sum, t) => sum + t, 0) / step.readings.length;
    return { ...step, mean, normal: mean * (step.rating / 100) };
  });
  const roundTotals = Array.from({ length: SAMPLE_ROUNDS }, (_, i) => rows.reduce((sum, r) => sum + r.readings[i], 0));
  const meanTotal = rows.reduce((sum, r) => sum + r.mean, 0);
  const normalTotal = rows.reduce((sum, r) => sum + r.normal, 0);
  const standard = normalTotal * (1 + SAMPLE_ALLOWANCE_PERCENT / 100);

  return (
    <>
      <figure className="obs-sheet">
        <div className="obs-sheet-head">
          <span className="obs-sheet-title">ใบบันทึกการจับเวลา</span>
          <span className="obs-sheet-tag">ข้อมูลตัวอย่าง</span>
        </div>
        <dl className="obs-meta">
          <div><dt>Process</dt><dd>ประกอบฝาครอบมอเตอร์</dd></div>
          <div><dt>ผู้ปฏิบัติงาน</dt><dd>สมชาย ใจดี</dd></div>
          <div><dt>สถานี</dt><dd>สายประกอบ 2 สถานี 4</dd></div>
          <div><dt>หน่วยเวลา</dt><dd>วินาที</dd></div>
        </dl>
        <table className="obs-table">
          <thead>
            <tr>
              <th>ที่</th>
              <th>Step</th>
              {roundTotals.map((_, i) => (
                <th key={i} className="num">รอบ {i + 1}</th>
              ))}
              <th className="num obs-derived">เฉลี่ย</th>
              <th className="num">Rating</th>
              <th className="num obs-derived">Normal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.name}>
                <td>{i + 1}</td>
                <td>{row.name}</td>
                {row.readings.map((t, j) => (
                  <td key={j} className="num">{t.toFixed(2)}</td>
                ))}
                <td className="num obs-derived">{row.mean.toFixed(2)}</td>
                <td className="num">{row.rating}%</td>
                <td className="num obs-derived">{row.normal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>รวมต่อรอบ</td>
              {roundTotals.map((t, i) => (
                <td key={i} className="num">{t.toFixed(2)}</td>
              ))}
              <td className="num obs-derived">{meanTotal.toFixed(2)}</td>
              <td />
              <td className="num obs-derived">{normalTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <dl className="obs-summary">
          <div><dt>Normal time รวม</dt><dd>{normalTotal.toFixed(2)} <small>วินาที</small></dd></div>
          <div><dt>Allowance</dt><dd>{SAMPLE_ALLOWANCE_PERCENT.toFixed(1)} <small>%</small></dd></div>
          <div><dt>Standard time</dt><dd>{standard.toFixed(2)} <small>วินาที</small></dd></div>
        </dl>
      </figure>
      <p className="obs-caption">
        จับเวลาแต่ละ Step ด้วยแอปมือถือที่หน้างาน แล้ว Dashboard นี้คำนวณค่าเฉลี่ย Normal time และ Standard time ให้ตามตารางด้านบน
      </p>
    </>
  );
}

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="sidebar-logo">MTS</span>
          <span className="sidebar-title">Motion &amp; Time Study</span>
        </div>
        {children}
      </div>
      <aside className="auth-aside" aria-label="ตัวอย่างใบบันทึกการจับเวลา">
        <SampleObservationSheet />
      </aside>
    </div>
  );
}
