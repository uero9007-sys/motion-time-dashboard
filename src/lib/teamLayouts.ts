// ผัง Line Balancing ที่เก็บในฐานข้อมูล (ตาราง line_layouts, migration ขั้นที่ 9) ให้ทั้งองค์กรเห็นผังเดียวกัน
// ถ้ายังไม่ได้รัน migration หรือเป็นโหมดทดลอง → available = false แล้วหน้าเก็บในเบราว์เซอร์แบบเดิม
import { supabase } from './supabase';
import type { StationInput, TimeBasis } from './lineBalance';

export type LayoutData = {
  basis: TimeBasis;
  lastN: number | null;
  takt: number | null;
  availableSec: number | null;
  stations: StationInput[];
};
export type SavedLayout = LayoutData & { id: string; name: string; savedAt: string };

type Row = { id: string; name: string; data: unknown; updated_at: string };

// ตารางยังไม่มี: PostgREST ตอบ PGRST205 (schema cache) หรือ Postgres 42P01
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist/i.test(error.message ?? '');
}

// ข้อมูลจากฐานข้อมูลผ่านมือคนอื่นมา ตรวจรูปร่างก่อนใช้ แถวที่เสียข้ามไป (ไม่ทำให้ทั้งหน้าพัง)
export function rowToLayout(row: Row): SavedLayout | null {
  const d = row.data as Partial<LayoutData> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.stations)) return null;
  const stations = d.stations.filter(
    (s): s is StationInput => !!s && typeof s.id === 'string' && Array.isArray(s.processKeys) && s.processKeys.every((k) => typeof k === 'string')
  );
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: row.id,
    name: row.name,
    savedAt: row.updated_at,
    basis: d.basis === 'standard' ? 'standard' : 'observed',
    lastN: num(d.lastN),
    takt: num(d.takt),
    availableSec: num(d.availableSec),
    stations,
  };
}

export function layoutToData(l: LayoutData): LayoutData {
  return { basis: l.basis, lastN: l.lastN, takt: l.takt, availableSec: l.availableSec, stations: l.stations };
}

export async function listTeamLayouts(organizationId: string): Promise<{ available: boolean; layouts: SavedLayout[]; error: string | null }> {
  if (!organizationId) return { available: false, layouts: [], error: null };
  const { data, error } = await supabase
    .from('line_layouts')
    .select('id, name, data, updated_at')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: true });
  if (isMissingTable(error)) return { available: false, layouts: [], error: null };
  if (error) return { available: true, layouts: [], error: error.message };
  return { available: true, layouts: (data as Row[]).map(rowToLayout).filter((l): l is SavedLayout => l !== null), error: null };
}

// ชื่อซ้ำในองค์กร = เขียนทับผังเดิม (unique organization_id, name)
export async function saveTeamLayout(organizationId: string, name: string, layout: LayoutData): Promise<string | null> {
  const { error } = await supabase
    .from('line_layouts')
    .upsert({ organization_id: organizationId, name, data: layoutToData(layout) }, { onConflict: 'organization_id,name' });
  return error ? error.message : null;
}

export async function deleteTeamLayout(id: string): Promise<string | null> {
  // select('id') เพื่อรู้ว่าลบได้จริง (RLS ไม่ให้ลบจะได้ 0 แถวโดยไม่มี error)
  const { data, error } = await supabase.from('line_layouts').delete().eq('id', id).select('id');
  if (error) return error.message;
  return (data ?? []).length === 0 ? 'ไม่มีสิทธิ์ลบผังนี้ (บทบาท Viewer ดูได้อย่างเดียว)' : null;
}
