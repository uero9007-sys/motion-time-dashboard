import { useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_SETTINGS, LINE_BALANCE_STORAGE_KEY, type DashboardSettings, type FontScale } from '../lib/settings';
import type { Page } from '../types';

type Props = {
  settings: DashboardSettings;
  onChange: (patch: Partial<DashboardSettings>) => void;
  onReset: () => void;
  onRefresh: () => void;
  counts: { groups: number; studies: number; steps: number };
};

type Connection = { status: 'idle' | 'checking' | 'ok' | 'error'; message?: string };

const FONT_SCALES: { value: FontScale; label: string }[] = [
  { value: 1, label: 'ปกติ' },
  { value: 1.1, label: 'ใหญ่' },
  { value: 1.2, label: 'ใหญ่มาก' },
];

const START_PAGES: { value: Page; label: string }[] = [
  { value: 'home', label: 'หน้าหลัก (เลือก Process)' },
  { value: 'analysis', label: 'การวิเคราะห์' },
  { value: 'calc', label: 'การคำนวณ (Line Balancing)' },
  { value: 'learn', label: 'การศึกษา' },
];

const supabaseHost = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL).host;
  } catch {
    return '-';
  }
})();

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <span className="setting-label">{label}</span>
        {hint && <span className="setting-hint">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export default function SettingsPage({ settings, onChange, onReset, onRefresh, counts }: Props) {
  const [connection, setConnection] = useState<Connection>({ status: 'idle' });
  const [lineCleared, setLineCleared] = useState(false);

  const checkConnection = async () => {
    setConnection({ status: 'checking' });
    const started = performance.now();
    const { error } = await supabase.from('process_groups').select('id', { count: 'exact', head: true });
    const ms = Math.round(performance.now() - started);
    setConnection(
      error
        ? { status: 'error', message: error.message || 'เชื่อมต่อไม่สำเร็จ' }
        : { status: 'ok', message: `เชื่อมต่อได้ · ตอบกลับใน ${ms} ms` }
    );
  };

  const clearLineBalance = () => {
    if (!window.confirm('ล้างไลน์ที่จัดไว้ในหน้า "การคำนวณ" หรือไม่?')) return;
    try {
      localStorage.removeItem(LINE_BALANCE_STORAGE_KEY);
    } catch {
      // ไม่มีสิทธิ์เข้าถึง storage — ไม่มีอะไรให้ล้าง
    }
    setLineCleared(true);
  };

  const confirmReset = () => {
    if (window.confirm('คืนค่าการตั้งค่าทั้งหมดเป็นค่าเริ่มต้นหรือไม่?')) onReset();
  };

  const cvInvalid = settings.cvStable >= settings.cvWatch;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>ตั้งค่า</h1>
          <p className="page-subtitle">การตั้งค่าจะบันทึกไว้ในเบราว์เซอร์นี้ และใช้ทันที</p>
        </div>
      </div>

      <section className="card settings-card">
        <h2>ค่าเริ่มต้นการคำนวณ</h2>
        <SettingRow label="ระดับความเชื่อมั่น" hint="ใช้ในการ์ด &quot;จำนวนรอบที่ต้องจับเพิ่ม&quot;">
          <select value={settings.confidence} onChange={(e) => onChange({ confidence: Number(e.target.value) })}>
            <option value={90}>90%</option>
            <option value={95}>95%</option>
            <option value={99}>99%</option>
          </select>
        </SettingRow>
        <SettingRow label="ค่าคลาดเคลื่อนที่ยอมรับ" hint="ใช้ในการ์ด &quot;จำนวนรอบที่ต้องจับเพิ่ม&quot;">
          <select value={settings.errorPercent} onChange={(e) => onChange({ errorPercent: Number(e.target.value) })}>
            <option value={5}>5%</option>
            <option value={10}>10%</option>
            <option value={15}>15%</option>
          </select>
        </SettingRow>
        <SettingRow label="เวลาทำงานต่อกะ" hint="ค่าเริ่มต้นของไลน์ใหม่ในหน้า &quot;การคำนวณ&quot;">
          <span className="input-with-unit">
            <input
              type="number"
              min={1}
              value={settings.shiftMinutes}
              onChange={(e) => onChange({ shiftMinutes: Math.max(1, Number(e.target.value)) })}
            />
            นาที
          </span>
        </SettingRow>
        <SettingRow label="เกณฑ์ความเสถียร (CV)" hint="ใช้ในตาราง &quot;ความเสถียรของเวลาแต่ละ Step&quot;">
          <span className="cv-inputs">
            <span className="badge badge-good">เสถียร ≤</span>
            <input
              type="number"
              min={1}
              value={settings.cvStable}
              onChange={(e) => onChange({ cvStable: Number(e.target.value) })}
              aria-label="เกณฑ์เสถียร (%)"
            />
            <span className="badge badge-warn">ควรติดตาม ≤</span>
            <input
              type="number"
              min={1}
              value={settings.cvWatch}
              onChange={(e) => onChange({ cvWatch: Number(e.target.value) })}
              aria-label="เกณฑ์ควรติดตาม (%)"
            />
            %
          </span>
        </SettingRow>
        {cvInvalid && <p className="setting-error">เกณฑ์ "เสถียร" ต้องน้อยกว่าเกณฑ์ "ควรติดตาม"</p>}
      </section>

      <section className="card settings-card">
        <h2>การแสดงผล</h2>
        <SettingRow label="ขนาดตัวอักษร">
          <div className="segmented" role="radiogroup" aria-label="ขนาดตัวอักษร">
            {FONT_SCALES.map((f) => (
              <button
                key={f.value}
                role="radio"
                aria-checked={settings.fontScale === f.value}
                className={settings.fontScale === f.value ? 'active' : ''}
                onClick={() => onChange({ fontScale: f.value })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="หน้าแรกเมื่อเปิด Dashboard">
          <select value={settings.startPage} onChange={(e) => onChange({ startPage: e.target.value as Page })}>
            {START_PAGES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </SettingRow>
      </section>

      <section className="card settings-card">
        <h2>ข้อมูลและการเชื่อมต่อ</h2>
        <SettingRow label="ฐานข้อมูล Supabase" hint={supabaseHost}>
          <span className="connection">
            <span className={`connection-status status-${connection.status}`}>
              {connection.status === 'idle' && 'ยังไม่ได้ตรวจสอบ'}
              {connection.status === 'checking' && 'กำลังตรวจสอบ...'}
              {(connection.status === 'ok' || connection.status === 'error') && connection.message}
            </span>
            <button className="btn" onClick={checkConnection} disabled={connection.status === 'checking'}>
              ตรวจสอบ
            </button>
          </span>
        </SettingRow>
        <SettingRow label="ข้อมูลที่โหลดไว้" hint={`${counts.groups} Process ใหญ่ · ${counts.studies} รอบ · ${counts.steps} Step`}>
          <button className="btn" onClick={onRefresh}>รีเฟรชข้อมูล</button>
        </SettingRow>
        <SettingRow label="ไลน์ที่จัดไว้ในหน้า &quot;การคำนวณ&quot;" hint="บันทึกไว้เฉพาะในเบราว์เซอร์นี้">
          <button className="btn" onClick={clearLineBalance} disabled={lineCleared}>
            {lineCleared ? 'ล้างแล้ว' : 'ล้างไลน์'}
          </button>
        </SettingRow>
      </section>

      <div className="settings-footer">
        <button className="btn btn-danger" onClick={confirmReset}>คืนค่าเริ่มต้นทั้งหมด</button>
        <span className="muted">
          ค่าเริ่มต้น: ความเชื่อมั่น {DEFAULT_SETTINGS.confidence}% · คลาดเคลื่อน {DEFAULT_SETTINGS.errorPercent}% · กะละ{' '}
          {DEFAULT_SETTINGS.shiftMinutes} นาที · CV {DEFAULT_SETTINGS.cvStable}/{DEFAULT_SETTINGS.cvWatch}%
        </span>
      </div>
    </>
  );
}
