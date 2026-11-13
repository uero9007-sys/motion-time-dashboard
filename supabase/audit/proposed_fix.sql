-- =============================================================================
-- ข้อเสนอแก้ไขจากการตรวจ RLS (2026-11-13) — ยังไม่ใช่ migration ห้ามย้ายเข้า migrations/ จนกว่าจะตรวจผลแล้ว
--
-- รันซ้ำได้ (idempotent) ทั้งไฟล์อยู่ใน transaction เดียว ถ้ามี error จะไม่มีอะไรถูกเปลี่ยน
-- ไม่ขึ้นกับขั้นที่ 4 (20261003000004_child_org_from_study.sql): ใช้ได้ทั้งฐานข้อมูลที่รันและไม่รันขั้นที่ 4
-- ก่อนรัน: รัน audit/rls_audit.sql เก็บผลไว้เทียบ / หลังรัน: รัน rls_audit.sql อีกครั้ง (ข้อ 3, 3b, 4)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) [ปานกลาง] Admin เขียนทับ invite_code ได้เอง
-- policy "admins rename organization" (ขั้นที่ 1) อนุญาต UPDATE ทุกคอลัมน์ของ organizations
-- หลังขั้นที่ 6 เพิ่มคอลัมน์ invite_code → Admin (ไม่ใช่ Owner) ตั้งรหัสเป็นค่าที่เดาง่าย เช่น 'AAAAAAAAAA'
-- ได้โดยไม่ผ่าน rotate_invite_code (ซึ่งตั้งใจให้เฉพาะ Owner) และรหัสนั้นใช้เข้าร่วมองค์กรได้จริง
-- แก้: ให้ authenticated แก้ได้เฉพาะคอลัมน์ name (โค้ดแอป/Dashboard ปัจจุบันไม่มีการ update organizations เลย)
-- rotate_invite_code / create_organization / handle_new_user เป็น security definer จึงไม่กระทบ
-- -----------------------------------------------------------------------------
revoke update on public.organizations from authenticated;
grant  update (name) on public.organizations to authenticated;

-- -----------------------------------------------------------------------------
-- 2) [ต่ำ] ฟังก์ชัน security definer ที่ยังเรียกได้โดย anon
-- is_org_member / has_org_role ไม่เคยถูก revoke จาก anon (Supabase ให้สิทธิ์ execute อัตโนมัติ)
-- ตอนนี้ไม่รั่วเพราะ anon ได้ auth.uid() = null → คืน false เสมอ แต่ไม่ควรเปิดฟังก์ชัน definer ให้ anon
-- policy ทั้งหมดเป็น "to authenticated" จึงไม่มี policy ไหนต้องให้ anon เรียกฟังก์ชันนี้
-- -----------------------------------------------------------------------------
revoke execute on function public.is_org_member(uuid)                      from public, anon;
revoke execute on function public.has_org_role(uuid, public.org_role[])    from public, anon;
grant  execute on function public.is_org_member(uuid)                      to authenticated;
grant  execute on function public.has_org_role(uuid, public.org_role[])    to authenticated;

-- ฟังก์ชัน trigger ไม่ควรถูกเรียกผ่าน API (เรียกตรงก็ error อยู่แล้ว แต่ปิดไว้ให้ผลตรวจข้อ 4 สะอาด)
-- trigger ยังทำงานตามปกติ เพราะ Postgres ไม่ตรวจสิทธิ์ execute ตอน trigger ทำงาน
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.prevent_last_owner_removal()',
    'public.check_study_group_organization()',
    'public.inherit_study_organization()',     -- มีบนฐานข้อมูลจริง (ไม่เคยรันขั้นที่ 4)
    'public.set_organization_from_study()',    -- มีเฉพาะถ้ารันขั้นที่ 4
    'public.handle_new_user()',
    'public.generate_invite_code()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) ย้ำการตั้งค่าเดิม (ไม่เปลี่ยนอะไรถ้าฐานข้อมูลจริงตรงกับ migrations อยู่แล้ว)
-- กันกรณีมีคนปิด RLS หรือ grant ให้ anon ด้วยมือใน Dashboard ของ Supabase ภายหลัง
-- ทุกตารางในรายการนี้มี policy ครบแล้ว (ยกเว้น invite_attempts ที่ตั้งใจไม่มี) การเปิด RLS จึงไม่ทำให้แอปพัง
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'process_groups', 'studies', 'steps', 'defect_logs',
    'organizations', 'organization_members', 'invitations', 'profiles', 'invite_attempts'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end;
$$;

revoke all on public.invite_attempts from authenticated;

commit;

-- ทดสอบหลังรัน (Login เป็น Admin ที่ไม่ใช่ Owner ในแอป แล้วลอง):
--   supabase.from('organizations').update({ invite_code: 'AAAAAAAAAA' }).eq('id', orgId)
--   → ต้องได้ error "permission denied for table organizations"
