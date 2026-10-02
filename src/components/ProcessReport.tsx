// รายงานสรุปของ Process ใหญ่ สำหรับพิมพ์ / บันทึกเป็น PDF ผ่านหน้าต่าง Print ของเบราว์เซอร์
// (ใช้ Print แทน jsPDF เพราะสระ/วรรณยุกต์ภาษาไทยจะแสดงถูกต้องด้วยฟอนต์ของเว็บ)
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { mean } from '../lib/ie';
import type { StepSummary, StudyRow } from '../lib/export';

type Props = {
  groupName: string;
  rows: StudyRow[];
  stepSummaries: StepSummary[];
  sampleSize: { confidence: number; errorPercent: number; required: number };
  cvStable: number;
  cvWatch: number;
  generatedAt: string;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const s2 = (n: number) => n.toFixed(2);

const CHART_WIDTH = 680;
const axisTick = { fontSize: 10, fill: '#756B60' };

export default function ProcessReport({ groupName, rows, stepSummaries, sampleSize, cvStable, cvWatch, generatedAt }: Props) {
  const totalSecs = rows.map((r) => r.totalMs / 1000);
  const operators = new Set(rows.map((r) => r.study.operator_name).filter(Boolean));
  const processes = new Set(rows.map((r) => r.study.process_name));
  const totalDefects = rows.reduce((sum, r) => sum + r.defects.length, 0);
  const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
  const avgStandardSec = mean(rows.map((r) => r.standardMs / 1000));
  const avgAllowance = mean(rows.map((r) => r.study.allowance_percent || 0));
  const remaining = Math.max(sampleSize.required - rows.length, 0);

  // ตัวเลขด้านล่างเป็นการสรุปอัตโนมัติจากข้อมูล ให้ผู้อ่านเห็นประเด็นทันที
  const bottleneck = stepSummaries.reduce<StepSummary | null>((m, s) => (!m || s.standardSec > m.standardSec ? s : m), null);
  const unstable = stepSummaries.filter((s) => s.n >= 2 && s.cvPercent > cvWatch);
  const topDefect = stepSummaries.reduce<StepSummary | null>((m, s) => (s.defectCount > (m?.defectCount ?? 0) ? s : m), null);

  // Step ที่มีไม่ครบทุกรอบ มักเกิดจากชื่อ Step สะกดต่างกัน ทำให้ผลรวมราย Step คลาดจากค่าจริง
  const partialSteps = stepSummaries.filter((s) => s.n < rows.length);
  const stepStandardSum = stepSummaries.reduce((a, s) => a + s.standardSec, 0);

  const firstDate = rows[0]?.study.created_at;
  const lastDate = rows[rows.length - 1]?.study.created_at;

  const cvClass = (cv: number, n: number) =>
    n < 2 ? '' : cv <= cvStable ? 'rp-good' : cv <= cvWatch ? 'rp-watch' : 'rp-bad';

  return (
    <div className="print-report">
      <header className="rp-header">
        <div>
          <div className="rp-eyebrow">รายงานการศึกษาการเคลื่อนไหวและเวลา (Motion &amp; Time Study)</div>
          <h1>{groupName}</h1>
          <div className="rp-meta">
            ช่วงเวลาที่เก็บข้อมูล: {firstDate ? `${fmtDate(firstDate)} – ${fmtDate(lastDate!)}` : '-'}
            {' · '}จัดทำเมื่อ {new Date(generatedAt).toLocaleString('th-TH')}
          </div>
        </div>
        <div className="rp-std">
          <span>Standard Time</span>
          <strong>{s2(avgStandardSec)}</strong>
          <span>วินาที / รอบ</span>
        </div>
      </header>

      <section className="rp-kpis">
        <div><span>จำนวนรอบที่จับ</span><strong>{rows.length}</strong></div>
        <div><span>Process ย่อย</span><strong>{processes.size}</strong></div>
        <div><span>ผู้ปฏิบัติงาน</span><strong>{operators.size} คน</strong></div>
        <div><span>เวลาจริงเฉลี่ย</span><strong>{s2(mean(totalSecs))} s</strong></div>
        <div><span>ประสิทธิภาพเฉลี่ย</span><strong>{mean(rows.map((r) => r.efficiency)).toFixed(1)}%</strong></div>
        <div><span>Man-hour / ชิ้น</span><strong>{mean(rows.map((r) => r.manHourPerUnit)).toFixed(4)}</strong></div>
        <div><span>ผลิตรวม</span><strong>{totalQty} ชิ้น</strong></div>
        <div><span>Defect รวม</span><strong>{totalDefects}</strong></div>
      </section>

      <section className="rp-section rp-findings">
        <h2>ข้อสังเกตสำคัญ</h2>
        <ul>
          <li>
            <b>ความเพียงพอของข้อมูล:</b>{' '}
            {rows.length < 2
              ? `มีข้อมูล ${rows.length} รอบ ต้องมีอย่างน้อย 2 รอบจึงประเมินได้`
              : remaining === 0
                ? `เพียงพอแล้ว (ต้องการ ${sampleSize.required} รอบ ที่ความเชื่อมั่น ${sampleSize.confidence}% คลาดเคลื่อน ±${sampleSize.errorPercent}%)`
                : `ควรจับเพิ่มอีก ${remaining} รอบ (ต้องการ ${sampleSize.required} รอบ ที่ความเชื่อมั่น ${sampleSize.confidence}% คลาดเคลื่อน ±${sampleSize.errorPercent}%)`}
          </li>
          {bottleneck && (
            <li>
              <b>Step ที่ใช้เวลามากที่สุด:</b> {bottleneck.name} ({s2(bottleneck.standardSec)} s,{' '}
              {avgStandardSec > 0 ? ((bottleneck.standardSec / avgStandardSec) * 100).toFixed(0) : 0}% ของ Standard Time)
            </li>
          )}
          <li>
            <b>ความผันผวนของเวลา:</b>{' '}
            {unstable.length === 0
              ? `ทุก Step มี CV ไม่เกิน ${cvWatch}%`
              : `${unstable.map((s) => `${s.name} (CV ${s.cvPercent.toFixed(0)}%)`).join(', ')} มีความผันผวนสูง ควรตรวจสอบวิธีการทำงาน`}
          </li>
          <li>
            <b>Defect:</b>{' '}
            {totalDefects === 0
              ? 'ไม่พบ Defect ระหว่างการจับเวลา'
              : `พบ ${totalDefects} ครั้ง${topDefect ? ` ส่วนใหญ่ที่ Step "${topDefect.name}" (${topDefect.defectCount} ครั้ง)` : ''}`}
          </li>
        </ul>
      </section>

      <section className="rp-section">
        <h2>เวลามาตรฐานราย Step</h2>
        <p className="rp-note">
          Normal Time = เวลาเฉลี่ย × Rating · Standard Time = Normal Time × (1 + Allowance {avgAllowance.toFixed(1)}%)
          · CV ≤ {cvStable}% = เสถียร, ≤ {cvWatch}% = เฝ้าระวัง
        </p>
        <table className="rp-table">
          <thead>
            <tr>
              <th>#</th><th className="rp-left">Step</th><th>n</th><th>เฉลี่ย (s)</th><th>SD</th><th>Min</th><th>Max</th>
              <th>CV%</th><th>Rating</th><th>Normal (s)</th><th>Standard (s)</th><th>Defect</th>
            </tr>
          </thead>
          <tbody>
            {stepSummaries.map((s, i) => (
              <tr key={s.name}>
                <td>{i + 1}</td>
                <td className="rp-left">{s.name}</td>
                <td>{s.n}</td>
                <td>{s2(s.meanSec)}</td>
                <td>{s2(s.sdSec)}</td>
                <td>{s2(s.minSec)}</td>
                <td>{s2(s.maxSec)}</td>
                <td className={cvClass(s.cvPercent, s.n)}>{s.n < 2 ? '-' : s.cvPercent.toFixed(1)}</td>
                <td>{s.avgRating.toFixed(0)}%</td>
                <td>{s2(s.normalSec)}</td>
                <td><b>{s2(s.standardSec)}</b></td>
                <td>{s.defectCount || ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={9} className="rp-left">รวมทุก Step</td>
              <td>{s2(stepSummaries.reduce((a, s) => a + s.normalSec, 0))}</td>
              <td><b>{s2(stepStandardSum)}</b></td>
              <td>{totalDefects || ''}</td>
            </tr>
          </tfoot>
        </table>
        {partialSteps.length > 0 && (
          <p className="rp-warning">
            มี Step ที่ไม่ได้อยู่ในทุกรอบ: {partialSteps.map((s) => `"${s.name}" (${s.n}/${rows.length} รอบ)`).join(', ')}
            {' '}ผลรวมราย Step ({s2(stepStandardSum)} s) จึงต่างจาก Standard Time เฉลี่ยต่อรอบ ({s2(avgStandardSec)} s)
            · ตรวจสอบว่าชื่อ Step สะกดต่างกันหรือไม่ (แก้ชื่อได้ที่หน้ารายการ Study)
          </p>
        )}
      </section>

      <section className="rp-section rp-charts">
        <div>
          <h2>Standard Time ราย Step (วินาที)</h2>
          <BarChart
            width={CHART_WIDTH}
            height={Math.max(120, stepSummaries.length * 26 + 30)}
            data={stepSummaries.map((s) => ({ name: s.name, value: Number(s.standardSec.toFixed(2)) }))}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
          >
            <CartesianGrid stroke="#EEE7DC" horizontal={false} />
            <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={210} tick={axisTick} tickLine={false} axisLine={false} />
            <Bar dataKey="value" fill="#A07C5B" radius={[0, 3, 3, 0]} isAnimationActive={false}
              label={{ position: 'right', fontSize: 10, fill: '#2E2925' }} />
          </BarChart>
        </div>
        {rows.length > 1 && (
          <div>
            <h2>แนวโน้มเวลาต่อรอบ (วินาที)</h2>
            <LineChart
              width={CHART_WIDTH}
              height={190}
              data={rows.map((r) => ({
                name: `${r.roundNo}`,
                actual: Number((r.totalMs / 1000).toFixed(2)),
                standard: Number((r.standardMs / 1000).toFixed(2)),
              }))}
              margin={{ top: 8, right: 24, bottom: 4, left: 8 }}
            >
              <CartesianGrid stroke="#EEE7DC" vertical={false} />
              <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: '#DDD2C2' }}
                label={{ value: 'รอบที่', position: 'insideBottomRight', offset: -2, fontSize: 10, fill: '#756B60' }} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Line dataKey="actual" name="เวลาจริง" stroke="#A07C5B" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
              <Line dataKey="standard" name="Standard" stroke="#5E7552" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </LineChart>
            <div className="rp-legend">
              <span><i style={{ background: '#A07C5B' }} />เวลาจริง</span>
              <span><i style={{ background: '#5E7552' }} />Standard Time</span>
            </div>
          </div>
        )}
      </section>

      <section className="rp-section rp-break">
        <h2>รายละเอียดแต่ละรอบ</h2>
        <table className="rp-table">
          <thead>
            <tr>
              <th>รอบ</th><th className="rp-left">วันที่</th><th className="rp-left">Process</th>
              <th className="rp-left">ผู้ปฏิบัติงาน</th><th>ชิ้น</th>
              <th>เวลาจริง (s)</th><th>Standard (s)</th><th>ประสิทธิภาพ</th><th>Defect</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.study.id}>
                <td>{r.roundNo}</td>
                <td className="rp-left">{fmtDateTime(r.study.created_at)}</td>
                <td className="rp-left">{r.study.process_name}</td>
                <td className="rp-left">{r.study.operator_name || '-'}</td>
                <td>{r.qty}</td>
                <td>{s2(r.totalMs / 1000)}</td>
                <td>{s2(r.standardMs / 1000)}</td>
                <td>{r.efficiency.toFixed(1)}%</td>
                <td>{r.defects.length || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="rp-footer">
        สร้างจาก Motion &amp; Time Study Dashboard · ข้อมูลดิบทั้งหมดดูได้จากไฟล์ Excel (Export ข้อมูลดิบ)
      </footer>
    </div>
  );
}
