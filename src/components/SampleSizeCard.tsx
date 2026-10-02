import type { requiredSampleSize } from '../lib/ie';

type Props = {
  stats: ReturnType<typeof requiredSampleSize>;
  confidence: number;
  errorPercent: number;
  onConfidenceChange: (value: number) => void;
  onErrorPercentChange: (value: number) => void;
};

export default function SampleSizeCard({ stats, confidence, errorPercent, onConfidenceChange, onErrorPercentChange }: Props) {
  return (
    <div className="card sample-size-card">
      <div className="sample-size-header">
        <h2>จำนวนรอบที่ต้องจับเพิ่ม</h2>
        <div className="sample-size-controls">
          <label>
            ความเชื่อมั่น
            <select value={confidence} onChange={(e) => onConfidenceChange(Number(e.target.value))}>
              <option value={90}>90%</option>
              <option value={95}>95%</option>
              <option value={99}>99%</option>
            </select>
          </label>
          <label>
            ค่าคลาดเคลื่อนที่ยอมรับ
            <select value={errorPercent} onChange={(e) => onErrorPercentChange(Number(e.target.value))}>
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={15}>15%</option>
            </select>
          </label>
        </div>
      </div>
      {stats.n < 2 ? (
        <p className="sample-size-warning">ต้องมีข้อมูลอย่างน้อย 2 รอบ (ตอนนี้มี {stats.n} รอบ)</p>
      ) : (
        <div className="sample-size-stats">
          <div className="stat-item">
            <span className="stat-label">รอบที่จับแล้ว</span>
            <span className="stat-value">{stats.n}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">ค่าเฉลี่ย</span>
            <span className="stat-value">{stats.mean.toFixed(2)}s</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">ส่วนเบี่ยงเบนมาตรฐาน</span>
            <span className="stat-value">{stats.sd.toFixed(2)}s</span>
          </div>
          <div className="stat-item highlight">
            <span className="stat-label">รอบที่ควรมีทั้งหมด</span>
            <span className="stat-value">{stats.required}</span>
          </div>
          <div className={`stat-item ${stats.remaining === 0 ? 'success' : 'highlight'}`}>
            <span className="stat-label">{stats.remaining === 0 ? 'สถานะ' : 'ต้องจับเพิ่มอีก'}</span>
            <span className="stat-value">{stats.remaining === 0 ? '✓ เพียงพอแล้ว' : `${stats.remaining} รอบ`}</span>
          </div>
        </div>
      )}
    </div>
  );
}
