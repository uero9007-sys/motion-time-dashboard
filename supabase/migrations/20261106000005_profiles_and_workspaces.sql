-- ขั้นที่ 5: สมัครสมาชิกเองได้ + ทุกคนมีพื้นที่ของตัวเอง
--
-- - ตาราง profiles เก็บชื่อ-นามสกุล (ผู้ใช้อ่าน/แก้ได้เฉพาะแถวของตัวเอง)
-- - สมัครใหม่ → ระบบสร้างบริษัทให้ 1 แห่งโดยผู้สมัครเป็น Owner
--     * เลือก "ใช้งานส่วนตัว"  → ชื่อ "งานของ <ชื่อ>"  (เห็นข้อมูลของตัวเองคนเดียว)
--     * เลือก "สร้างบริษัท"    → ใช้ชื่อบริษัทที่กรอก  (ชวนคนอื่นเข้ามาได้ในหน้า "สมาชิก")
-- - ข้อมูลแยกกันด้วย RLS เดิม (กรองตาม organization_id) ไม่ต้องแก้ตารางเดิม
-- - คนที่ถูกเชิญไว้ก่อนสมัคร ยังเข้าบริษัทที่เชิญอัตโนมัติเหมือนเดิม (accept_invitations)
--
-- รันครั้งเดียวทั้งไฟล์ใน Supabase → SQL Editor  (ยกเลิก: rollback/20261106000005_profiles_and_workspaces.down.sql)

begin;

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '' check (length(full_name) <= 120),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ทำงานทุกครั้งที่มีผู้ใช้ใหม่ใน auth.users
-- security definer เพราะผู้สมัครยังไม่มีสิทธิ์สร้างบริษัทเอง และ search_path = '' กันการแอบสร้างฟังก์ชันชื่อซ้ำมาแทน
-- ค่าใน raw_user_meta_data มาจากฟอร์มสมัคร (ผู้ใช้กรอกเอง) จึงใช้เป็นข้อความเท่านั้น และตัดความยาว
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120);
  v_type    text := coalesce(new.raw_user_meta_data ->> 'workspace_type', 'personal');
  v_company text := left(trim(coalesce(new.raw_user_meta_data ->> 'company_name', '')), 120);
  v_org     uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, v_name)
  on conflict (id) do nothing;

  insert into public.organizations (name)
  values (
    case
      when v_type = 'company' and v_company <> '' then v_company
      else 'งานของ ' || coalesce(nullif(v_name, ''), split_part(new.email, '@', 1))
    end
  )
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, new.id, 'owner');

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ผู้ใช้ที่มีอยู่แล้วได้ profile ด้วย (ไม่สร้างพื้นที่ใหม่ให้ เพราะเป็นสมาชิกบริษัทเดิมอยู่แล้ว)
insert into public.profiles (id, full_name)
select u.id, left(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 120)
from auth.users u
on conflict (id) do nothing;

commit;
