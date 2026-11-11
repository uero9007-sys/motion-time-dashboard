-- ขั้นที่ 0: ตารางข้อมูลหลัก 4 ตาราง (process_groups, studies, steps, defect_logs)
--
-- ตารางเหล่านี้สร้างด้วยมือใน Supabase ตั้งแต่ก่อนมีโฟลเดอร์ migrations จึงไม่เคยมีไฟล์สร้าง
-- ไฟล์นี้ "สร้างกลับ" จากโค้ดของแอป/Dashboard และข้อมูลใน backups/supabase-data-2026-10-02.json
-- เพื่อให้ตั้งฐานข้อมูลใหม่จาก repo ได้ครบ (เช่น โปรเจกต์ทดสอบ หรือกู้คืนระบบ):
--   รันไฟล์นี้ → แล้วรัน migrations ที่เหลือตามลำดับชื่อไฟล์
--
-- ⚠ รายละเอียดที่ไม่มีในโค้ด (ชนิดตัวเลข, on delete) เป็นค่าที่เลือกให้สมเหตุสมผล อาจไม่ตรงกับฐานข้อมูลจริง 100%
--   เทียบกับของจริงได้ด้วย verify.sql ข้อ 6 แล้วแก้ไฟล์นี้ให้ตรง
-- ฐานข้อมูลจริงที่มีตารางอยู่แล้ว: ทุกคำสั่งใช้ if not exists จึงไม่แตะตารางเดิม (อย่างมากเพิ่ม index ที่ยังไม่มี)

begin;

create table if not exists public.process_groups (
  id         uuid primary key default gen_random_uuid(),
  -- ขั้นที่ 6 เปลี่ยนเป็น unique (organization_id, name) โดยอ้างชื่อ constraint นี้
  name       text not null constraint process_groups_name_key unique,
  created_at timestamptz not null default now(),
  -- Layout หน้า Study ที่จำไว้ต่อ Process ใหญ่ (เดิมอยู่ใน MotionTimeStudyApp/supabase/add_step_layout.sql)
  layout     text not null default 'list' check (layout in ('list', 'grid', 'focus', 'compact'))
);

-- 1 แถว = 1 รอบการจับเวลา (id มาจากแอป ใช้กันส่งซ้ำ)
create table if not exists public.studies (
  id                uuid primary key default gen_random_uuid(),
  process_name      text not null,
  process_group_id  uuid references public.process_groups(id) on delete set null,
  operator_name     text,
  allowance_percent numeric,
  quantity_produced integer,
  created_at        timestamptz not null default now(),  -- เวลาเริ่มรอบ (แอปส่งมาเอง)
  finished_at       timestamptz
);

create table if not exists public.steps (
  id                 uuid primary key default gen_random_uuid(),
  study_id           uuid not null references public.studies(id) on delete cascade,
  name               text not null,
  order_index        integer not null,
  time_ms            bigint not null,
  performance_rating numeric
);

create table if not exists public.defect_logs (
  id          uuid primary key default gen_random_uuid(),
  study_id    uuid not null references public.studies(id) on delete cascade,
  step_name   text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists studies_process_group_id_idx on public.studies(process_group_id);

commit;
