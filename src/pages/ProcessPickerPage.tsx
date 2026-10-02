import type { ProcessGroup } from '../types';

export type ProcessCard = ProcessGroup & {
  cycleCount: number;
  processCount: number;
  lastCreatedAt: string | null;
};

type Props = {
  cards: ProcessCard[];
  isLoading: boolean;
  onSelect: (groupId: string) => void;
  onRefresh: () => void;
};

export default function ProcessPickerPage({ cards, isLoading, onSelect, onRefresh }: Props) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>เลือก Process</h1>
          <p className="page-subtitle">เลือก Process ใหญ่ที่ต้องการดูข้อมูล</p>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={onRefresh}>รีเฟรชข้อมูล</button>
        </div>
      </div>

      {isLoading ? (
        <p className="empty-state">กำลังโหลดข้อมูล...</p>
      ) : cards.length === 0 ? (
        <p className="empty-state">ยังไม่มี Process ในระบบ</p>
      ) : (
        <div className="process-grid">
          {cards.map((card) => (
            <button key={card.id} className="process-card" onClick={() => onSelect(card.id)}>
              <span className="process-card-name">{card.name}</span>
              {card.cycleCount === 0 ? (
                <span className="process-card-meta">ยังไม่มีข้อมูล</span>
              ) : (
                <>
                  <span className="process-card-meta">
                    {card.processCount} Process · {card.cycleCount} รอบ
                  </span>
                  {card.lastCreatedAt && (
                    <span className="process-card-date">
                      ล่าสุด {new Date(card.lastCreatedAt).toLocaleDateString('th-TH')}
                    </span>
                  )}
                </>
              )}
              <span className="process-card-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
