import type { ReactNode } from 'react';
import { ROLE_LABELS, type Account, type Membership } from '../lib/auth';
import type { Page } from '../types';

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'home', label: 'หน้าหลัก' },
  { page: 'learn', label: 'การศึกษา' },
  { page: 'analysis', label: 'การวิเคราะห์' },
  { page: 'calc', label: 'การคำนวณ' },
  { page: 'members', label: 'สมาชิก' },
  { page: 'settings', label: 'ตั้งค่า' },
];

type Props = {
  page: Page;
  onNavigate: (page: Page) => void;
  organization: Membership;
  account: Account;
};

export function Sidebar({ page, onNavigate, organization, account }: Props) {
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
      <div className="sidebar-account">
        {account.memberships.length > 1 ? (
          <select
            className="org-switcher"
            value={organization.id}
            onChange={(e) => account.onSwitchOrganization(e.target.value)}
            aria-label="เลือกบริษัท"
          >
            {account.memberships.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <span className="sidebar-org">{organization.name}</span>
        )}
        <span className="sidebar-user" title={account.email}>
          {account.email} · {ROLE_LABELS[organization.role]}
        </span>
        <button className="link-button" onClick={account.onSignOut}>ออกจากระบบ</button>
      </div>
    </aside>
  );
}

// โครงหน้าที่ทุกหน้าใช้ร่วมกัน: Sidebar ด้านซ้าย + เนื้อหาหลัก
export function AppLayout({ children, after, ...sidebar }: Props & { children: ReactNode; after?: ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar {...sidebar} />
      <main className="main-content">{children}</main>
      {after}
    </div>
  );
}
