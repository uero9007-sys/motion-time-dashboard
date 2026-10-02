-- ขั้นที่ 2: เปิด RLS ของตารางข้อมูล — หลังจากนี้ต้อง Login และเป็นสมาชิกบริษัทจึงจะเห็นข้อมูล
--
-- ⚠ ยังไม่ต้องรัน รันหลังจาก:
--   1. รันไฟล์ 20261002000001_organizations.sql แล้ว
--   2. Dashboard มีหน้า Login แล้ว และ Owner Login ได้ (ตรวจด้วย verify.sql ว่ามีแถวใน organization_members)
-- ถ้ารันก่อน Dashboard จะไม่เห็นข้อมูลใดๆ (ยกเลิกได้ด้วย rollback/20261002000002_enable_rls.down.sql)

begin;

-- ลบ policy เดิมของ 4 ตาราง (เช่น policy ที่เปิดให้ anon อ่าน/เขียนได้ทั้งหมด) แล้วใช้ชุดใหม่แทน
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('process_groups', 'studies', 'steps', 'defect_logs')
  loop
    raise notice 'ลบ policy เดิม: % บนตาราง %', p.policyname, p.tablename;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

-- เลิกใส่บริษัทแรกให้อัตโนมัติ: นับจากนี้แอปต้องระบุ organization_id เอง
alter table public.process_groups alter column organization_id drop default;
alter table public.studies        alter column organization_id drop default;

-- สมาชิกทุกบทบาทอ่านได้, Owner / Admin / Member แก้ไขได้, Viewer อ่านอย่างเดียว
do $$
declare
  t text;
  editors constant text := 'public.has_org_role(organization_id, array[''owner'', ''admin'', ''member'']::public.org_role[])';
begin
  foreach t in array array['process_groups', 'studies', 'steps', 'defect_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy "editors insert" on public.%I for insert to authenticated with check (%s)', t, editors);
    execute format('create policy "editors update" on public.%I for update to authenticated using (%s) with check (%s)', t, editors, editors);
    execute format('create policy "editors delete" on public.%I for delete to authenticated using (%s)', t, editors);
  end loop;
end;
$$;

commit;
