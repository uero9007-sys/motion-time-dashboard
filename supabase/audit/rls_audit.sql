-- =============================================================================
-- ตรวจความปลอดภัยฐานข้อมูล (RLS / policy / ฟังก์ชัน / สิทธิ์) ของฐานข้อมูลจริง
-- อ่านอย่างเดียว 100% — ไม่มี insert / update / delete / alter / grant ใดๆ
-- วิธีใช้: วางทั้งไฟล์ใน Supabase → SQL Editor แล้วกด Run
--   (SQL Editor แสดงเฉพาะผลของคำสั่งสุดท้าย ถ้าอยากเห็นทุกข้อ ให้เลือกข้อความทีละข้อแล้วกด Run)
-- ภูมิหลัง: anon key อยู่ใน JS สาธารณะ ใครก็เรียก API ได้ RLS จึงเป็นด่านเดียวที่กันข้อมูล
-- =============================================================================

begin read only;  -- กันพลาด: ถ้ามีคำสั่งเขียนข้อมูลหลุดมา Postgres จะปฏิเสธ

-- -----------------------------------------------------------------------------
-- 1) ตาราง / view ทุกตัวใน schema public พร้อมสถานะ RLS
-- ผลที่ไม่ดี:
--   - rls_enabled = false บนตารางใดก็ตาม (kind = table)  → ใครมี grant ก็อ่าน-เขียนได้ทั้งตาราง
--   - มีตารางที่ไม่รู้จัก (นอกเหนือจาก process_groups, studies, steps, defect_logs, organizations,
--     organization_members, invitations, profiles, invite_attempts) → ตารางเก่าที่สร้างด้วยมือ ต้องตรวจเพิ่ม
--   - kind = view ที่ options ไม่มี security_invoker=true → view ข้าม RLS ของตารางต้นทางได้
--   - policy_count = 0 บนตารางที่ RLS เปิด → ปิดทุกคน (ปลอดภัย) ปกติเฉพาะ invite_attempts
-- -----------------------------------------------------------------------------
select c.relname                              as table_name,
       case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview'
                      when 'p' then 'partitioned' when 'f' then 'foreign' end as kind,
       c.relrowsecurity                       as rls_enabled,
       c.relforcerowsecurity                  as rls_forced,
       coalesce(c.reloptions::text, '')       as options,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
order by c.relrowsecurity, c.relname;

-- -----------------------------------------------------------------------------
-- 2) policy ทั้งหมด (คอลัมน์ verdict ช่วยชี้จุดเสี่ยง)
-- ผลที่ไม่ดี:
--   - roles มี {public} หรือ {anon}                    → คนไม่ Login ได้สิทธิ์ตาม policy นั้น
--   - using_expr หรือ with_check_expr = 'true'         → ไม่กรองอะไรเลย (เห็น/เขียนได้ทุกแถวทุกบริษัท)
--   - cmd = INSERT แต่ with_check_expr ว่าง            → insert แถวของบริษัทใดก็ได้
--   - cmd = UPDATE แต่ with_check_expr ว่าง            → ระบุไม่ชัด (Postgres ใช้ using แทน) ควรตรวจ
--   - PERMISSIVE หลายตัวบน cmd เดียวกัน                → OR กัน ตัวที่หลวมที่สุดชนะ
--   - policy ของ 4 ตารางข้อมูลที่ไม่ได้อ้าง is_org_member / has_org_role(organization_id ...)
-- คาดหวัง: 4 ตารางข้อมูลมี "members read", "editors insert", "editors update", "editors delete"
--          อย่างละ 1 ตัว และ roles = {authenticated}
-- -----------------------------------------------------------------------------
select tablename, policyname, permissive, roles, cmd,
       qual       as using_expr,
       with_check as with_check_expr,
       case
         when roles && array['public', 'anon']::name[]                           then 'BAD: anon/public'
         when coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true'   then 'BAD: true'
         when cmd = 'INSERT' and with_check is null                              then 'BAD: insert no check'
         when cmd in ('UPDATE', 'ALL') and with_check is null                    then 'WARN: no with check'
         else 'ok'
       end as verdict
from pg_policies
where schemaname = 'public'
order by verdict desc, tablename, cmd, policyname;

-- -----------------------------------------------------------------------------
-- 3) สิทธิ์ระดับตาราง (GRANT) ของ anon / authenticated
-- ผลที่ไม่ดี:
--   - anon มีสิทธิ์ใดๆ บนตารางใน public                → ถ้า RLS ปิดหรือ policy หลวม anon เข้าถึงได้ (ควรไม่มีแถวของ anon เลย)
--   - authenticated มีสิทธิ์บนตารางที่ rls_enabled = false → ผู้ใช้ทุกคนทุกบริษัทเห็นข้อมูลกัน
--   - authenticated มีสิทธิ์บน invite_attempts          → ควรไม่มีเลย
-- หมายเหตุ: authenticated มี SELECT/INSERT/UPDATE/DELETE บนตารางที่เปิด RLS เป็นเรื่องปกติของ Supabase
-- -----------------------------------------------------------------------------
select g.table_name, g.grantee, string_agg(g.privilege_type, ', ' order by g.privilege_type) as privileges,
       c.relrowsecurity as rls_enabled
from information_schema.role_table_grants g
join pg_namespace n on n.nspname = g.table_schema
join pg_class c on c.relname = g.table_name and c.relnamespace = n.oid
where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'PUBLIC')
group by g.table_name, g.grantee, c.relrowsecurity
order by g.grantee, g.table_name;

-- 3b) สิทธิ์ระดับคอลัมน์ของ organizations
-- ผลที่ไม่ดี: ข้อ 3 แสดง authenticated มี UPDATE ทั้งตาราง organizations
--   → Admin (ไม่ใช่ Owner) เขียนทับ invite_code เป็นค่าที่เดาง่ายได้เอง (ข้ามข้อจำกัด "เฉพาะ Owner rotate")
-- หลังรัน proposed_fix.sql: ข้อ 3 ไม่มี UPDATE ของ organizations และข้อนี้มี UPDATE เฉพาะคอลัมน์ name
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name = 'organizations' and privilege_type = 'UPDATE'
order by grantee, column_name;

-- -----------------------------------------------------------------------------
-- 4) ฟังก์ชันใน public: definer?, ตั้ง search_path?, ใครเรียกได้
-- ผลที่ไม่ดี:
--   - security = DEFINER และ config ไม่มี search_path=      → ถูกแทรกฟังก์ชัน/ตารางปลอมได้
--   - security = DEFINER, anon_can_execute = true, is_trigger_fn = false และไม่ได้ตรวจ auth.uid()
--     (ยอมรับได้: is_org_member / has_org_role ซึ่งตรวจ auth.uid() และ anon ได้ false เสมอ)
--   - join_organization / rotate_invite_code / create_organization / accept_invitations /
--     list_organization_members / submit_study_round → anon_can_execute ต้องเป็น false
--   - generate_invite_code / handle_new_user / set_organization_from_study → authenticated_can_execute ต้องเป็น false
--   - มีฟังก์ชัน DEFINER ที่ไม่รู้จัก (ไม่อยู่ใน migrations) → ต้องเปิดอ่านโค้ดด้วย pg_get_functiondef(oid)
-- -----------------------------------------------------------------------------
select p.proname                                                   as function_name,
       pg_get_function_identity_arguments(p.oid)                   as args,
       case when p.prosecdef then 'DEFINER' else 'invoker' end     as security,
       coalesce(array_to_string(p.proconfig, ', '), '-- ไม่ได้ตั้ง --') as config,
       has_function_privilege('anon', p.oid, 'execute')            as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute')   as authenticated_can_execute,
       pg_get_function_result(p.oid) = 'trigger'                   as is_trigger_fn,
       position('auth.uid()' in p.prosrc) > 0                      as mentions_auth_uid
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, has_function_privilege('anon', p.oid, 'execute') desc, p.proname;

-- -----------------------------------------------------------------------------
-- 5) trigger บนตารางใน public และ auth.users (ดูว่าฐานข้อมูลจริงเป็นชุดไหน)
-- ผลที่คาด (ไม่เคยรันขั้นที่ 4): steps / defect_logs มี *_inherit_organization (invoker) เท่านั้น
-- ผลที่ไม่ดี:
--   - steps หรือ defect_logs ไม่มี trigger เติม organization_id เลย → insert พัง / ต้องพึ่งค่าที่แอปส่งมา
--   - studies ไม่มี studies_check_group_organization → ผูก Study เข้ากับ Process ใหญ่ของบริษัทอื่นได้
--   - organization_members ไม่มี organization_members_keep_owner → บริษัทอาจไม่เหลือ Owner
--   - auth.users ไม่มี on_auth_user_created → สมัครใหม่แล้วไม่มีพื้นที่ทำงาน
--   - enabled = 'D' (ปิดอยู่)
-- -----------------------------------------------------------------------------
select n.nspname as schema, c.relname as table_name, t.tgname as trigger_name, p.proname as function_name,
       case when p.prosecdef then 'DEFINER' else 'invoker' end as fn_security, t.tgenabled as enabled
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p      on p.oid = t.tgfoid
where not t.tgisinternal
  and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
order by 1, 2, 3;

-- -----------------------------------------------------------------------------
-- 6) default privileges: ตาราง/ฟังก์ชันที่ "จะสร้างในอนาคต" ได้สิทธิ์อะไรอัตโนมัติ
-- ผลที่ไม่ดี: ไม่ใช่ช่องโหว่ทันที แต่ถ้า acl ให้ anon=arwd... บน objtype r แปลว่าตารางใหม่ทุกตาราง
--            ที่ลืม enable RLS จะเปิดให้ anon ทันที → ทุก migration ที่สร้างตารางต้อง enable RLS + revoke anon
-- -----------------------------------------------------------------------------
select pg_get_userbyid(d.defaclrole) as owner_role, d.defaclobjtype as objtype, d.defaclacl as acl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'
order by 1, 2;

-- -----------------------------------------------------------------------------
-- 7) ตัวเลขที่ควรเป็นศูนย์ (นับอย่างเดียว ไม่แสดงข้อมูลจริง)
-- ผลที่ไม่ดี:
--   - *_mismatch > 0          → step/defect ที่บริษัทไม่ตรงกับ study (คนบริษัทอื่นอาจเห็นตาม RLS)
--   - orgs_without_owner > 0  → บริษัทที่ไม่มีใครจัดการได้
--   - pending_invites > 0     → คำเชิญที่ยังไม่มีใครรับ ถ้าปิด "Confirm email" ใน Authentication → Providers → Email
--                               ใครสมัครด้วยอีเมลนั้นก็ได้สิทธิ์ตามคำเชิญ (ระดับ owner อันตรายที่สุด)
--   - weak_invite_codes > 0   → invite_code ที่ไม่ใช่ 10 ตัวจากชุดตัวอักษรที่ระบบสุ่ม (ถูกเขียนทับด้วยมือ)
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.steps s join public.studies st on st.id = s.study_id
     where s.organization_id is distinct from st.organization_id)                                     as steps_mismatch,
  (select count(*) from public.defect_logs d join public.studies st on st.id = d.study_id
     where d.organization_id is distinct from st.organization_id)                                     as defects_mismatch,
  (select count(*) from public.organizations o where not exists (
     select 1 from public.organization_members m where m.organization_id = o.id and m.role = 'owner')) as orgs_without_owner,
  (select count(*) from public.invitations where accepted_at is null)                                  as pending_invites,
  (select count(*) from public.invitations where accepted_at is null and role = 'owner')               as pending_owner_invites,
  (select count(*) from public.organizations where invite_code !~ '^[A-HJ-NP-Z2-9]{10}$')              as weak_invite_codes;

commit;
