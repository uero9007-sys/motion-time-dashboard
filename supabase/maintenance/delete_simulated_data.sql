-- ลบข้อมูลจำลองที่ใช้ทดสอบระบบตอนพัฒนาแอปหลายรอบ (5 พ.ย. 2569)
--   Process ใหญ่ "ทดสอบระบบ – จำลอง 4 Step" · ผู้ปฏิบัติงาน "จำลองโดย Claude" · 3 รอบ
--
-- วิธีใช้ (Supabase → SQL Editor):
--   1) รันเฉพาะส่วนที่ 1 ก่อน ดูว่ารายการที่จะลบถูกต้อง (ควรได้ราว 3 รอบ)
--   2) สำรองข้อมูลก่อน: Dashboard → ตั้งค่า → "ดาวน์โหลดไฟล์สำรอง"
--   3) รันส่วนที่ 2 ทั้งก้อน ถ้าพบเกิน 10 รอบ จะหยุดเองโดยไม่ลบอะไร (กันลบผิด)
-- ลบแล้วย้อนกลับไม่ได้ (ยกเว้นนำไฟล์สำรองกลับเข้า)

-- ===== ส่วนที่ 1: ดูก่อน (ไม่ลบ) =====
select s.id, s.created_at, s.process_name, s.operator_name, g.name as process_group,
       (select count(*) from public.steps st where st.study_id = s.id) as steps,
       (select count(*) from public.defect_logs d where d.study_id = s.id) as defects
from public.studies s
left join public.process_groups g on g.id = s.process_group_id
where s.operator_name = 'จำลองโดย Claude'
   or g.name = 'ทดสอบระบบ – จำลอง 4 Step'
order by s.created_at;

-- ===== ส่วนที่ 2: ลบ =====
begin;

do $$
declare
  n int;
begin
  select count(*) into n
  from public.studies s
  left join public.process_groups g on g.id = s.process_group_id
  where s.operator_name = 'จำลองโดย Claude' or g.name = 'ทดสอบระบบ – จำลอง 4 Step';

  if n > 10 then
    raise exception 'พบ % รอบ มากกว่าที่คาด (ราว 3) หยุดไว้ก่อน ตรวจด้วยส่วนที่ 1', n;
  end if;

  -- steps และ defect_logs ถูกลบตามอัตโนมัติ (on delete cascade)
  delete from public.studies s
  using public.process_groups g
  where g.id = s.process_group_id and g.name = 'ทดสอบระบบ – จำลอง 4 Step';

  delete from public.studies where operator_name = 'จำลองโดย Claude';

  -- ลบ Process ใหญ่ทดสอบเมื่อไม่เหลือรอบใดอ้างถึง
  delete from public.process_groups g
  where g.name = 'ทดสอบระบบ – จำลอง 4 Step'
    and not exists (select 1 from public.studies s where s.process_group_id = g.id);

  raise notice 'ลบข้อมูลจำลองแล้ว % รอบ', n;
end
$$;

commit;
