-- ขั้นที่ 2: ฟังก์ชันรายชื่อสมาชิกพร้อมอีเมล สำหรับหน้า "สมาชิก"
-- (แอปอ่าน auth.users โดยตรงไม่ได้ จึงให้ฟังก์ชันนี้คืนเฉพาะอีเมลของคนในบริษัทเดียวกัน)
-- รันได้ทันที ไม่กระทบการใช้งานปัจจุบัน

begin;

create function public.list_organization_members(org uuid)
returns table (user_id uuid, email text, role public.org_role, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = org and public.is_org_member(org)
  order by m.created_at;
$$;

revoke execute on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;

commit;
