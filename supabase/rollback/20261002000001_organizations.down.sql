-- ยกเลิกขั้นที่ 1: ลบระบบบริษัททั้งหมด ข้อมูล Study / Step / Defect เดิมยังอยู่ครบ
-- ถ้ารันขั้นที่ 3 ไปแล้ว ให้รัน 20261002000003_enable_rls.down.sql ก่อน

begin;

-- policy ของขั้นที่ 3 อ้างถึงคอลัมน์ organization_id ต้องลบก่อนจึงจะลบคอลัมน์ได้
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['process_groups', 'studies', 'steps', 'defect_logs'] loop
    foreach p in array array['members read', 'editors insert', 'editors update', 'editors delete'] loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
  end loop;
end;
$$;

drop trigger if exists steps_inherit_organization on public.steps;
drop trigger if exists defect_logs_inherit_organization on public.defect_logs;
drop trigger if exists studies_check_group_organization on public.studies;

alter table public.process_groups drop column if exists organization_id;
alter table public.studies        drop column if exists organization_id;
alter table public.steps          drop column if exists organization_id;
alter table public.defect_logs    drop column if exists organization_id;

drop function if exists public.inherit_study_organization();
drop function if exists public.check_study_group_organization();
drop function if exists public.accept_invitations();
drop function if exists public.list_organization_members(uuid);

drop table if exists public.invitations;
drop table if exists public.organization_members;
drop table if exists public.organizations;

drop function if exists public.prevent_last_owner_removal();
drop function if exists public.is_org_member(uuid);
drop function if exists public.has_org_role(uuid, public.org_role[]);
drop type if exists public.org_role;

commit;
