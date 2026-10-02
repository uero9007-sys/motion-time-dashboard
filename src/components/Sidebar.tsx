import type { ReactNode } from 'react';
import type { Page } from '../types';

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'home', label: 'หน้าหลัก' },
  { page: 'learn', label: 'การศึกษา' },
  { page: 'analysis', label: 'การวิเคราะห์' },
  { page: 'calc', label: 'การคำนวณ' },
  { page: 'settings', label: 'ตั้งค่า' },
];

type Props = {
  page: Page;
  onNavigate: (page: Page) => void;
};

export function Sidebar({ page, onNavigate }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">MTS</span>
        <span className="sidebar-title">Motion &amp; Time Study</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.page}
            className={`nav-item ${page === item.page ? 'active' : ''}`}
            href="#"
            onClick={(e) => { e.preventDefault(); onNavigate(item.page); }}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

// โครงหน้าที่ทุกหน้าใช้ร่วมกัน: Sidebar ด้านซ้าย + เนื้อหาหลัก
export function AppLayout({ page, onNavigate, children, after }: Props & { children: ReactNode; after?: ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar page={page} onNavigate={onNavigate} />
      <main className="main-content">{children}</main>
      {after}
    </div>
  );
}
