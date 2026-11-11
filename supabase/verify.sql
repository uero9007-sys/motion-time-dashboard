-- ตรวจผลหลังรัน migration (อ่านอย่างเดียว รันได้ทุกเมื่อ)

-- 1) ข้อมูลเดิมต้องครบ และทุกแถวต้องมี organization_id
select 'process_groups' as table_name, count(*) as total_rows, count(organization_id) as with_org from public.process_groups
union all select 'studies',     count(*), count(organization_id) from public.studies
union all select 'steps',       count(*), count(organization_id) from public.steps
union all select 'defect_logs', count(*), count(organization_id) from public.defect_logs;

-- 2) บริษัท สมาชิก และคำเชิญ
select o.name, m.role, u.email, m.created_at
from public.organizations o
left join public.organization_members m on m.organization_id = o.id
left join auth.users u on u.id = m.user_id;

select o.name, i.email, i.role, i.accepted_at
from public.invitations i join public.organizations o on o.id = i.organization_id;

-- 3) สถานะ RLS และ policy ของทุกตาราง
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- 4) ฟังก์ชัน RPC ที่แอป / Dashboard เรียก (ขั้นที่ 7: ต้องมี submit_study_round)
select p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args,
       case when p.prosecdef then 'definer' else 'invoker' end as security
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('submit_study_round', 'join_organization', 'rotate_invite_code', 'create_organization',
                    'accept_invitations', 'list_organization_members', 'is_org_member', 'has_org_role')
order by 1;

-- 5) trigger ของตารางข้อมูล (หลังขั้นที่ 7: steps / defect_logs เหลือเฉพาะ *_set_organization)
select c.relname as table_name, t.tgname as trigger_name, p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
order by 1, 2;

-- 6) คอลัมน์ของตารางหลัก ใช้เทียบกับ migrations/20261001000000_base_tables.sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('process_groups', 'studies', 'steps', 'defect_logs')
order by table_name, ordinal_position;
