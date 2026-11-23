// ป้ายเล็กข้างปุ่มรีเฟรช บอกว่าหน้านี้อัปเดตเองเมื่อมีรอบใหม่ (แสดงเฉพาะตอนเชื่อมต่อ Realtime ได้จริง)
import type { LiveStatus } from '../lib/useLiveReload';

export default function LiveBadge({ status }: { status: LiveStatus }) {
  if (status !== 'live') return null;
  return (
    <span className="live-badge" title="มีรอบใหม่ส่งมาจากแอปมือถือ หน้านี้จะอัปเดตเองภายในไม่กี่วินาที">
      <span className="live-dot" aria-hidden="true" />
      อัปเดตอัตโนมัติ
    </span>
  );
}
