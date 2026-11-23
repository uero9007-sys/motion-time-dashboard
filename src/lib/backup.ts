// สำรองข้อมูลทั้งองค์กรเป็นไฟล์ Excel
// 1 แผ่นต่อ 1 ตาราง ชื่อคอลัมน์ตรงกับฐานข้อมูล จึงนำกลับเข้า Supabase ได้ (Table Editor → Import data from CSV ทีละแผ่น
// เรียงตามลำดับ process_groups → studies → steps → defect_logs เพราะตารางหลังอ้างถึงตารางก่อนหน้า)
// Supabase แผนฟรีไม่มีสำรองข้อมูลรายวันให้ จึงให้เจ้าของกดสำรองเองเป็นรอบ และเตือนเมื่อไม่ได้สำรองนาน
import { fetchAllRows } from './fetchAll';
import { localDateStamp } from './export';

export const BACKUP_TABLES = ['process_groups', 'studies', 'steps', 'defect_logs'] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupData = Record<BackupTable, Record<string, unknown>[]>;

export const BACKUP_REMIND_DAYS = 7;
const LAST_BACKUP_KEY = 'mts-last-backup';

// วันที่สำรองล่าสุด (ต่อองค์กร ต่อเบราว์เซอร์)
export function readLastBackup(organizationId: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): string | null {
  try {
    const all = JSON.parse(storage?.getItem(LAST_BACKUP_KEY) ?? '{}') as Record<string, string>;
    return typeof all[organizationId] === 'string' ? all[organizationId] : null;
  } catch {
    return null;
  }
}

export function writeLastBackup(organizationId: string, isoDate: string, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
  try {
    const all = JSON.parse(storage?.getItem(LAST_BACKUP_KEY) ?? '{}') as Record<string, string>;
    all[organizationId] = isoDate;
    storage?.setItem(LAST_BACKUP_KEY, JSON.stringify(all));
  } catch {
    // บันทึกไม่ได้ก็แค่ไม่มีการเตือน ไฟล์สำรองยังได้ครบ
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// จำนวนวันเต็มนับจากสำรองล่าสุด (null = ไม่เคยสำรองในเบราว์เซอร์นี้)
export function daysSince(isoDate: string | null, now: Date = new Date()): number | null {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

export function needsBackupReminder(isoDate: string | null, now: Date = new Date()): boolean {
  const days = daysSince(isoDate, now);
  return days === null || days >= BACKUP_REMIND_DAYS;
}

// แปลงค่าที่ Excel เก็บไม่ได้ตรงๆ (object / array) เป็น JSON ข้อความ ค่าอื่นคงเดิม (วันที่เป็นข้อความ ISO ตามฐานข้อมูล)
export function toSheetRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v]))
  );
}

export async function fetchBackup(organizationId: string): Promise<{ data: BackupData; error: string | null }> {
  const filter: Record<string, string> = organizationId ? { organization_id: organizationId } : {};
  const results = await Promise.all(BACKUP_TABLES.map((t) => fetchAllRows<Record<string, unknown>>(t, '*', filter)));
  const error = results.find((r) => r.error)?.error ?? null;
  const data = Object.fromEntries(BACKUP_TABLES.map((t, i) => [t, results[i].data])) as BackupData;
  return { data, error };
}

export async function downloadBackup(organizationName: string, data: BackupData) {
  const { utils, writeFile } = await import('xlsx');
  const workbook = utils.book_new();
  const info = [
    { หัวข้อ: 'องค์กร', ค่า: organizationName },
    { หัวข้อ: 'สำรองเมื่อ', ค่า: new Date().toLocaleString('th-TH') },
    ...BACKUP_TABLES.map((t) => ({ หัวข้อ: `จำนวนแถว ${t}`, ค่า: data[t].length })),
    { หัวข้อ: 'นำกลับ', ค่า: 'Supabase → Table Editor → Import CSV ทีละแผ่น ตามลำดับ process_groups, studies, steps, defect_logs' },
  ];
  utils.book_append_sheet(workbook, utils.json_to_sheet(info), 'README');
  for (const t of BACKUP_TABLES) {
    // ตารางว่างยังใส่แผ่นไว้ ให้รู้ว่าสำรองครบทุกตาราง
    utils.book_append_sheet(workbook, utils.json_to_sheet(toSheetRows(data[t])), t);
  }
  const safeName = organizationName.replace(/[\\/:*?"<>|]/g, '').trim() || 'organization';
  writeFile(workbook, `MTS-Backup-${safeName}-${localDateStamp()}.xlsx`);
}
