// ปุ่มเลือกธีม 3 แบบ (ตามระบบ / สว่าง / มืด) ใช้ใน Sidebar และหน้าเข้าสู่ระบบ
import type { ReactNode } from 'react';
import type { ThemePreference } from '../lib/theme';
import { setThemePreference, useThemePreference } from '../themeStore';

const icon = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  {
    value: 'system',
    label: 'ตามระบบ',
    icon: icon(<><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></>),
  },
  {
    value: 'light',
    label: 'สว่าง',
    icon: icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  },
  {
    value: 'dark',
    label: 'มืด',
    icon: icon(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
  },
];

export default function ThemeToggle() {
  const preference = useThemePreference();
  return (
    <div className="segmented segmented-icon" role="radiogroup" aria-label="ธีมสี">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={preference === o.value}
          aria-label={o.label}
          title={o.label}
          className={preference === o.value ? 'active' : ''}
          onClick={() => setThemePreference(o.value)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
