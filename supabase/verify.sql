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
