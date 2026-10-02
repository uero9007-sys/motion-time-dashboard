-- ขั้นที่ 1: ระบบบริษัท / สมาชิก / คำเชิญ และผูกข้อมูลเดิมทั้งหมดเข้าบริษัทแรก
--
-- ไฟล์นี้ "ยังไม่" เปิด RLS ของตารางเดิม Dashboard ที่ใช้อยู่จึงทำงานต่อได้ตามปกติ
-- และตั้งค่า default ของ organization_id ไว้ เครื่องมืออื่นที่ insert ข้อมูลอยู่จึงไม่พัง
-- (การเปิด RLS อยู่ในไฟล์ 20261002000003_enable_rls.sql ซึ่งจะรันหลังทำหน้า Login เสร็จ)
--
-- รันครั้งเดียวทั้งไฟล์ใน Supabase → SQL Editor ถ้ามี error ส่วนใดส่วนหนึ่ง จะไม่มีอะไรถูกเปลี่ยนเลย

begin;

-- ===== แก้ 2 ค่านี้ก่อนรัน =====
create temporary table _bootstrap on commit drop as
select
  'บริษัทของฉัน'::text      as org_name,     -- ชื่อบริษัทแรก (เปลี่ยนภายหลังได้)
  'owner@example.com'::text as owner_email;  -- อีเมลของ Owner คนแรก (ต้องใช้อีเมลนี้ตอน Login)

-- ---------------------------------------------------------------------------
-- ตารางใหม่
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.org_role not null default 'member',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_id_idx on public.organization_members(user_id);

-- อีเมลเก็บเป็นตัวพิมพ์เล็กเสมอ เพื่อให้จับคู่กับอีเมลที่ Login ได้แน่นอน
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role            public.org_role not null default 'member',
  invited_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  unique (organization_id, email)
);
create index invitations_email_idx on public.invitations(email) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- ฟังก์ชันตรวจสิทธิ์ (ใช้ใน RLS policy)
-- security definer เพื่อให้อ่าน organization_members ได้โดยไม่ติด RLS ของตัวเอง (กัน recursion)
-- ---------------------------------------------------------------------------
create function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create function public.has_org_role(org uuid, roles public.org_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- รับคำเชิญ: แอปเรียกหลัง Login ทุกครั้ง
-- รับเฉพาะอีเมลที่ยืนยันแล้ว เพื่อกันคนสมัครด้วยอีเมลของคนอื่นแล้วได้สิทธิ์ตามคำเชิญ
-- ---------------------------------------------------------------------------
create function public.accept_invitations()
returns setof uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email     text;
  v_confirmed timestamptz;
begin
  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = auth.uid();

  if v_email is null or v_confirmed is null then
    return;
  end if;

  return query
  with accepted as (
    update public.invitations i
    set accepted_at = now()
    where i.email = v_email and i.accepted_at is null
    returning i.organization_id, i.role
  )
  insert into public.organization_members (organization_id, user_id, role)
  select a.organization_id, auth.uid(), a.role from accepted a
  on conflict (organization_id, user_id) do nothing
  returning organization_id;
end;
$$;

revoke execute on function public.accept_invitations() from public, anon;
grant execute on function public.accept_invitations() to authenticated;

-- บริษัทต้องเหลือ Owner อย่างน้อย 1 คนเสมอ (ยกเว้นตอนลบทั้งบริษัท)
create function public.prevent_last_owner_removal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.organization_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id and m.role = 'owner' and m.user_id <> old.user_id
     )
  then
    raise exception 'บริษัทต้องมี Owner อย่างน้อย 1 คน';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_keep_owner
before update or delete on public.organization_members
for each row execute function public.prevent_last_owner_removal();

-- ---------------------------------------------------------------------------
-- ผูกตารางเดิมเข้ากับบริษัท
-- ---------------------------------------------------------------------------
alter table public.process_groups add column organization_id uuid references public.organizations(id);
alter table public.studies        add column organization_id uuid references public.organizations(id);
alter table public.steps          add column organization_id uuid references public.organizations(id);
alter table public.defect_logs    add column organization_id uuid references public.organizations(id);

do $$
declare
  v_org uuid;
begin
  if exists (select 1 from _bootstrap where owner_email = 'owner@example.com') then
    raise exception 'ยังไม่ได้แก้อีเมลของ Owner ใน _bootstrap ด้านบนของไฟล์';
  end if;

  insert into public.organizations (name) select org_name from _bootstrap returning id into v_org;

  update public.process_groups set organization_id = v_org;
  update public.studies        set organization_id = v_org;
  update public.steps          set organization_id = v_org;
  update public.defect_logs    set organization_id = v_org;

  -- Owner คนแรกจะเข้าบริษัทอัตโนมัติเมื่อ Login ด้วยอีเมลนี้ครั้งแรก
  insert into public.invitations (organization_id, email, role)
  select v_org, lower(trim(owner_email)), 'owner' from _bootstrap;

  -- ชั่วคราว: ข้อมูลใหม่ที่ไม่ระบุบริษัทจะเข้าบริษัทแรก (ลบออกในไฟล์ enable_rls)
  execute format('alter table public.process_groups alter column organization_id set default %L', v_org);
  execute format('alter table public.studies alter column organization_id set default %L', v_org);
end;
$$;

alter table public.process_groups alter column organization_id set not null;
alter table public.studies        alter column organization_id set not null;
alter table public.steps          alter column organization_id set not null;
alter table public.defect_logs    alter column organization_id set not null;

create index process_groups_organization_id_idx on public.process_groups(organization_id);
create index studies_organization_id_idx        on public.studies(organization_id);
create index steps_organization_id_idx          on public.steps(organization_id);
create index defect_logs_organization_id_idx    on public.defect_logs(organization_id);

-- Step และ Defect ใช้บริษัทเดียวกับ Study เสมอ (แอปไม่ต้องส่ง organization_id มา และปลอมไม่ได้)
create function public.inherit_study_organization()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  select s.organization_id into new.organization_id from public.studies s where s.id = new.study_id;
  return new;
end;
$$;

create trigger steps_inherit_organization
before insert or update of study_id, organization_id on public.steps
for each row execute function public.inherit_study_organization();

create trigger defect_logs_inherit_organization
before insert or update of study_id, organization_id on public.defect_logs
for each row execute function public.inherit_study_organization();

-- Study ที่อยู่ใน Process ใหญ่ ต้องเป็นบริษัทเดียวกับ Process ใหญ่นั้น
create function public.check_study_group_organization()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.process_group_id is not null and not exists (
    select 1 from public.process_groups g
    where g.id = new.process_group_id and g.organization_id = new.organization_id
  ) then
    raise exception 'Process ใหญ่ที่เลือกไม่ได้อยู่ในบริษัทเดียวกับ Study';
  end if;
  return new;
end;
$$;

create trigger studies_check_group_organization
before insert or update of process_group_id, organization_id on public.studies
for each row execute function public.check_study_group_organization();

-- ---------------------------------------------------------------------------
-- RLS ของตารางใหม่ (ตารางใหม่ยังไม่มีใครใช้ จึงเปิดได้ทันที)
-- ---------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations          enable row level security;

revoke all on public.organizations, public.organization_members, public.invitations from anon;

create policy "members read their organizations" on public.organizations
  for select to authenticated using (public.is_org_member(id));

create policy "admins rename organization" on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.org_role[]));

create policy "members see co-members" on public.organization_members
  for select to authenticated using (public.is_org_member(organization_id));

-- Admin จัดการสมาชิกได้ แต่มีเพียง Owner ที่แต่งตั้งหรือแก้ไข Owner ได้
create policy "admins add members" on public.organization_members
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
  );

create policy "admins change roles" on public.organization_members
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
  );

create policy "admins remove members, anyone can leave" on public.organization_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
      and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
    )
  );

create policy "admins read invitations" on public.invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy "admins create invitations" on public.invitations
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
  );

create policy "admins cancel invitations" on public.invitations
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

commit;
