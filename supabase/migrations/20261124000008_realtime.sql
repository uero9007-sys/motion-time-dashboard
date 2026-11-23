-- ขั้นที่ 8: เปิด Realtime ให้ Dashboard อัปเดตเองเมื่อมีรอบใหม่จากแอปมือถือ
--
-- เพิ่ม studies และ steps เข้า publication "supabase_realtime" (Dashboard ฟังเฉพาะ INSERT)
-- RLS เดิมยังคุมอยู่: ผู้ใช้ได้ event เฉพาะแถวขององค์กรที่ตัวเองเป็นสมาชิก
-- ก่อนรันไฟล์นี้ Dashboard ยังใช้ได้ตามปกติ แค่ต้องกด "รีเฟรชข้อมูล" เอง
--
-- รันครั้งเดียวทั้งไฟล์ใน Supabase → SQL Editor  (ยกเลิก: rollback/20261124000008_realtime.down.sql)
-- รันซ้ำได้ ตารางที่อยู่ใน publication แล้วจะข้าม
-- ตรวจผล: select tablename from pg_publication_tables where pubname = 'supabase_realtime';

begin;

do $$
declare
  t text;
begin
  -- โปรเจกต์ Supabase มี publication นี้อยู่แล้ว เผื่อกรณีโปรเจกต์ที่ลบทิ้งไป
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['studies', 'steps'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'เปิด Realtime ให้ตาราง %', t;
    end if;
  end loop;
end
$$;

commit;
