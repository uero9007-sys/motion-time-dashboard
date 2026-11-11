-- ยกเลิกขั้นที่ 7: ลบ submit_study_round (แอปกลับไปใช้ทางสำรอง) และคืน trigger ชุดเดิมของขั้นที่ 1
begin;

drop function if exists public.submit_study_round(jsonb, jsonb, jsonb);

create or replace function public.inherit_study_organization()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  select s.organization_id into new.organization_id from public.studies s where s.id = new.study_id;
  return new;
end;
$$;

drop trigger if exists steps_inherit_organization on public.steps;
create trigger steps_inherit_organization
before insert or update of study_id, organization_id on public.steps
for each row execute function public.inherit_study_organization();

drop trigger if exists defect_logs_inherit_organization on public.defect_logs;
create trigger defect_logs_inherit_organization
before insert or update of study_id, organization_id on public.defect_logs
for each row execute function public.inherit_study_organization();

-- index ที่เพิ่มในขั้นที่ 7 ไม่มีผลต่อการทำงาน จึงเก็บไว้ (ลบได้ด้วย drop index ถ้าต้องการ)

commit;
