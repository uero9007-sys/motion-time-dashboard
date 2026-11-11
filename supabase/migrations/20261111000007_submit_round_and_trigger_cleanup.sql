-- ขั้นที่ 7: ส่ง 1 รอบเป็น transaction เดียว + ลบ trigger ที่ซ้ำกัน
--
-- 1) ติดตั้ง submit_study_round (เนื้อหาเดียวกับ MotionTimeStudyApp/supabase/submit_study_round.sql)
--    ตรวจเมื่อ 2026-11-11: ฐานข้อมูลจริงยังไม่มีฟังก์ชันนี้ (PGRST202) แอปจึงใช้ทางสำรองที่ insert 3 ครั้งแยกกัน
--    ถ้าเน็ตหลุดระหว่างทาง จะมีรอบที่ไม่มี Step ค้างจนกว่าจะกด "ลองส่งใหม่"
--    หลังรันไฟล์นี้ แอปจะใช้ฟังก์ชันนี้เองโดยไม่ต้องแก้โค้ด (lib/submit.ts ลองเรียก RPC ก่อนทุกครั้งที่เปิดแอป)
--
-- 2) steps / defect_logs มี trigger 2 ชุดที่ทำงานเดียวกัน (เติม organization_id จาก study)
--    - *_inherit_organization   จากขั้นที่ 1 (ถ้าไม่พบ study จะได้ null แล้วไปติด not null)
--    - *_set_organization       จากขั้นที่ 4 (ถ้าไม่พบ study แจ้ง error ชัดเจน)  ← เก็บตัวนี้
--    ถ้ามีครบทั้งสองชุด ลบชุดแรกออก (ผลลัพธ์เหมือนเดิม แค่ไม่ทำงานซ้ำ) ถ้ามีชุดเดียว ไม่แตะอะไร
--
-- รันครั้งเดียวทั้งไฟล์ใน Supabase → SQL Editor  (ยกเลิก: rollback/20261111000007_submit_round_and_trigger_cleanup.down.sql)
-- ตรวจผล: verify.sql ข้อ 4 และ 5

begin;

-- ---------------------------------------------------------------------------
-- 1) submit_study_round
-- - security invoker: ทำงานด้วยสิทธิ์ของผู้ใช้ที่ Login อยู่ RLS จึงยังตรวจว่าเป็น Owner / Admin / Member ของบริษัทนั้น
-- - studies.id มาจากแอป (uuid ของรอบ) ถ้าเคยส่งแล้วจะไม่ insert ซ้ำ และคืนค่า false
-- - steps / defect_logs ได้ organization_id จาก study อัตโนมัติ (trigger)
-- ---------------------------------------------------------------------------
create or replace function public.submit_study_round(p_study jsonb, p_steps jsonb, p_defects jsonb default '[]'::jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_study_id uuid := (p_study ->> 'id')::uuid;
begin
  insert into public.studies (
    id, organization_id, process_name, process_group_id, operator_name,
    allowance_percent, quantity_produced, created_at, finished_at
  )
  select
    s.id, s.organization_id, s.process_name, s.process_group_id, s.operator_name,
    s.allowance_percent, s.quantity_produced, s.created_at, s.finished_at
  from jsonb_populate_record(null::public.studies, p_study) s
  on conflict (id) do nothing;

  -- ส่งรอบนี้ไปแล้ว (transaction ก่อนหน้าสำเร็จครบ) → ไม่ต้องทำอะไรเพิ่ม
  if not found then
    return false;
  end if;

  insert into public.steps (study_id, name, order_index, time_ms, performance_rating)
  select v_study_id, st.name, st.order_index, st.time_ms, st.performance_rating
  from jsonb_populate_recordset(null::public.steps, coalesce(p_steps, '[]'::jsonb)) st;

  insert into public.defect_logs (study_id, step_name, occurred_at)
  select v_study_id, d.step_name, d.occurred_at
  from jsonb_populate_recordset(null::public.defect_logs, coalesce(p_defects, '[]'::jsonb)) d;

  return true;
end;
$$;

revoke execute on function public.submit_study_round(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.submit_study_round(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) ลบ trigger ที่ซ้ำ — เฉพาะตอนที่มีครบทั้งสองชุดจริง
--    ฐานข้อมูลที่ไม่เคยรันขั้นที่ 4 (เช่นฐานข้อมูลจริงเมื่อ 2026-11-11) มีแค่ *_inherit_organization
--    ชุดนั้นเป็นตัวเดียวที่เติม organization_id ให้ Step / Defect จึงต้องเก็บไว้ ไม่ลบ
-- ---------------------------------------------------------------------------
do $$
declare
  v_has_set boolean :=
    exists (select 1 from pg_trigger where tgname = 'steps_set_organization' and tgrelid = 'public.steps'::regclass)
    and exists (select 1 from pg_trigger where tgname = 'defect_logs_set_organization' and tgrelid = 'public.defect_logs'::regclass);
begin
  if v_has_set then
    drop trigger if exists steps_inherit_organization on public.steps;
    drop trigger if exists defect_logs_inherit_organization on public.defect_logs;
    drop function if exists public.inherit_study_organization();
    raise notice 'ลบ trigger *_inherit_organization ที่ซ้ำแล้ว (เหลือ *_set_organization)';
  else
    raise notice 'ไม่พบ *_set_organization (ไม่เคยรันขั้นที่ 4) จึงเก็บ *_inherit_organization ไว้ตามเดิม';
  end if;
end;
$$;

-- ช่วยหน้า Study / Export ที่ดึง Step และ Defect ทีละรอบ (where study_id = ...) ไม่ต้องสแกนทั้งตาราง
create index if not exists steps_study_id_idx on public.steps(study_id);
create index if not exists defect_logs_study_id_idx on public.defect_logs(study_id);

commit;
