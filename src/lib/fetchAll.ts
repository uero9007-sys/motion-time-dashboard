// ดึงข้อมูลทุกแถวจาก Supabase ทีละหน้า
// Supabase API คืนได้สูงสุด 1,000 แถวต่อคำขอ (Settings → API → Max rows) ถ้าเกินจะถูกตัดเงียบๆ โดยไม่มี error
// ทำให้การวิเคราะห์ผิดโดยไม่รู้ตัว จึงใช้ .range() ขอทีละ PAGE_SIZE แถวจนกว่าจะได้น้อยกว่าหนึ่งหน้า
import { supabase } from './supabase';

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  table: string,
  columns: string,
  filter: Record<string, string>,
  orderBy = 'id'
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .match(filter)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error: error.message };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
