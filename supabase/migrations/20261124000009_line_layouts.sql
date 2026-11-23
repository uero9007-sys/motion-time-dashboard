-- ขั้นที่ 9: เก็บผัง Line Balancing ที่บันทึกไว้ในฐานข้อมูล ให้ทุกคนในองค์กรเห็นผังเดียวกัน
--
-- เดิมผังเก็บใน localStorage ของเบราว์เซอร์ (คนอื่น/เครื่องอื่นไม่เห็น)
-- ก่อนรันไฟล์นี้ หน้า Line Balancing ยังใช้แบบเดิมได้ (ตรวจไม่พบตารางนี้ → เก็บในเบราว์เซอร์)
-- หลังรัน หน้าจะเก็บผังที่นี่ และมีปุ่มย้ายผังเก่าจากเบราว์เซอร์ขึ้นมา
--
-- สิทธิ์ (เหมือนตารางข้อมูลหลัก): สมาชิกทุกบทบาทอ่านได้ · Owner / Admin / Member บันทึก/แก้/ลบได้ · Viewer อ่านอย่างเดียว
-- รันครั้งเดียวทั้งไฟล์ใน Supabase → SQL Editor  (ยกเลิก: rollback/20261124000009_line_layouts.down.sql)

begin;

create table public.line_layouts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 100),
  -- สถานี, เกณฑ์เวลา, Takt ฯลฯ ตามที่หน้า Line Balancing ส่งมา (โครงสร้างกำหนดฝั่งแอป)
  data            jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- บันทึกชื่อเดิมซ้ำ = เขียนทับผังเดิม
  constraint line_layouts_org_name_key unique (organization_id, name)
);

create index line_layouts_organization_id_idx on public.line_layouts(organization_id);

create function public.touch_line_layout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger line_layouts_touch
before update on public.line_layouts
for each row execute function public.touch_line_layout();

alter table public.line_layouts enable row level security;
revoke all on public.line_layouts from anon;

create policy "members read" on public.line_layouts
  for select to authenticated using (public.is_org_member(organization_id));
create policy "editors insert" on public.line_layouts
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'member']::public.org_role[]));
create policy "editors update" on public.line_layouts
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'member']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'member']::public.org_role[]));
create policy "editors delete" on public.line_layouts
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'member']::public.org_role[]));

commit;
