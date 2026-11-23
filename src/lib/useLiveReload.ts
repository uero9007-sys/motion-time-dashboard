// อัปเดตหน้าเองเมื่อมีรอบใหม่ส่งขึ้นมาจากแอปมือถือ (Supabase Realtime)
//
// ฟัง INSERT ของ studies และ steps ขององค์กรนี้ แล้วรวมเหตุการณ์ที่มาติดๆ กัน (1 รอบ = 1 study + หลาย step)
// เป็นการโหลดใหม่ครั้งเดียวหลังเงียบไป DEBOUNCE_MS
// ต้องรัน migration ขั้นที่ 8 (เพิ่มตารางเข้า publication supabase_realtime) ก่อน ถ้ายังไม่รัน หน้าจะไม่ได้ event
// แต่ทุกอย่างยังทำงานเหมือนเดิม (กดรีเฟรชเอง) — RLS ยังคุมว่าเห็นเฉพาะข้อมูลขององค์กรตัวเอง
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export const DEBOUNCE_MS = 1500;
export type LiveStatus = 'connecting' | 'live' | 'off';

// เรียก fn ครั้งเดียวหลังจากไม่มีการเรียกซ้ำภายใน wait ms (แยกออกมาเพื่อทดสอบได้)
export function debounce(fn: () => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const call = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, wait);
  };
  call.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return call;
}

// scope แยกชื่อ channel ของแต่ละหน้า (หน้าหลักกับ Line Balancing เปิดพร้อมกันได้ ชื่อซ้ำจะชนกัน)
export function useLiveReload(organizationId: string, onChange: () => void, scope = 'main'): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    const trigger = debounce(() => latest.current(), DEBOUNCE_MS);
    // โหมดทดลองไม่มี organization_id → ฟังทั้งตาราง (RLS กรองให้อยู่แล้ว)
    const filter = organizationId ? { filter: `organization_id=eq.${organizationId}` } : {};
    const channel = supabase
      .channel(`live-${scope}-${organizationId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'studies', ...filter }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'steps', ...filter }, trigger)
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') setStatus('live');
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setStatus('off');
      });
    return () => {
      trigger.cancel();
      void supabase.removeChannel(channel);
    };
  }, [organizationId, scope]);

  return status;
}
