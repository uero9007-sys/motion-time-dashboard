-- ขั้นที่ 4: steps / defect_logs ใช้ organization_id ของ study เสมอ
--
-- ขั้นที่ 1 ตั้ง default ไว้เฉพาะ process_groups / studies ทำให้การ insert steps / defect_logs
-- ที่ไม่ได้ส่ง organization_id มาจะติด not null ไฟล์นี้ให้ฐานข้อมูลเติมค่าจาก study เอง
-- และกันไม่ให้ step / defect ถูกผูกกับบริษัทอื่นที่ไม่ใช่บริษัทของ study

begin;

create function public.set_organization_from_study()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.organization_id into new.organization_id
  from public.studies s
  where s.id = new.study_id;

  if new.organization_id is null then
    raise exception 'ไม่พบ study % สำหรับกำหนดบริษัท', new.study_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.set_organization_from_study() from public, anon, authenticated;

create trigger steps_set_organization
before insert or update of study_id, organization_id on public.steps
for each row execute function public.set_organization_from_study();

create trigger defect_logs_set_organization
before insert or update of study_id, organization_id on public.defect_logs
for each row execute function public.set_organization_from_study();

commit;
