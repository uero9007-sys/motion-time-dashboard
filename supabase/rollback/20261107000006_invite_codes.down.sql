-- ยกเลิกขั้นที่ 6: เอารหัสเชิญออก คืน trigger สมัครสมาชิกแบบขั้นที่ 5
-- สมาชิกที่เข้าร่วมด้วยรหัสไปแล้วยังอยู่ในองค์กร (ลบเองในหน้า "สมาชิก" ถ้าต้องการ)
-- ⚠ การคืน unique(name) ทั้งระบบจะล้มเหลวถ้าสององค์กรตั้งชื่อ Process ซ้ำกันไปแล้ว ให้เปลี่ยนชื่อให้ไม่ซ้ำก่อน

begin;

create or replace function public.handle_new_user()
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

alter table public.process_groups drop constraint if exists process_groups_org_name_key;
alter table public.process_groups add constraint process_groups_name_key unique (name);

drop function if exists public.join_organization(text);
drop function if exists public.rotate_invite_code(uuid);
drop function if exists public.create_organization(text);
drop table if exists public.invite_attempts;

alter table public.organizations drop constraint if exists organizations_invite_code_key;
alter table public.organizations drop column if exists invite_code;
drop function if exists public.normalize_invite_code(text);
drop function if exists public.generate_invite_code();

commit;
