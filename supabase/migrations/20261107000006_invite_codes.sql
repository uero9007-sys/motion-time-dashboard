-- ขั้นที่ 6: รหัสเชิญ (QR Code) ให้คนอื่นเข้าร่วมองค์กร
--
-- ใช้ระบบองค์กรเดิม (organizations + organization_members + RLS ตาม organization_id) ไม่สร้างตารางซ้ำ
-- - organizations.invite_code: รหัส 10 ตัว สุ่มด้วย gen_random_uuid() (cryptographically secure)
--   จากชุดตัวอักษร 32 ตัวที่ไม่มีตัวสับสน (ไม่มี 0 O 1 I) = 50 บิต เดาไม่ได้
-- - join_organization(code)  เข้าร่วมองค์กรด้วยรหัส (จำกัดผิดได้ 10 ครั้ง / 15 นาที / บัญชี)
-- - rotate_invite_code(org)  สร้างรหัสใหม่ เฉพาะ owner รหัสเก่าใช้ไม่ได้ทันที
-- - create_organization(name) สร้างองค์กรใหม่ ตัวเองเป็น owner
-- - ชื่อ Process ห้ามซ้ำภายในองค์กรเดียวกัน (เดิมห้ามซ้ำทั้งระบบ สององค์กรตั้งชื่อเหมือนกันไม่ได้)
-- - สมัครสมาชิกพร้อมรหัสเชิญ (workspace_type = 'join') → เข้าองค์กรนั้นเลย ถ้ารหัสผิดได้พื้นที่ส่วนตัวแทน
--
-- รันครั้งเดียวทั้งไฟล์ใน Supabase → SQL Editor  (ยกเลิก: rollback/20261107000006_invite_codes.down.sql)

begin;

-- ---------------------------------------------------------------------------
-- รหัสเชิญ
-- ---------------------------------------------------------------------------
create function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 32 ตัวพอดี: 256 หาร 32 ลงตัว ทุกตัวมีโอกาสเท่ากัน (ไม่เอียง)
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw      bytea := uuid_send(gen_random_uuid());
  -- ข้าม byte ที่ 6 และ 8 ของ uuid v4 เพราะเป็นเลขเวอร์ชัน/variant ที่ไม่สุ่ม
  picks    int[] := array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13];
  result   text := '';
  i        int;
begin
  foreach i in array picks loop
    result := result || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

alter table public.organizations add column invite_code text;
update public.organizations set invite_code = public.generate_invite_code() where invite_code is null;
alter table public.organizations
  alter column invite_code set not null,
  alter column invite_code set default public.generate_invite_code(),
  add constraint organizations_invite_code_key unique (invite_code);

-- รหัสที่ผู้ใช้พิมพ์/สแกนมา: ตัดช่องว่างและขีด แปลงเป็นตัวใหญ่
create function public.normalize_invite_code(code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- บันทึกการกรอกรหัส ใช้กันการเดารหัสรัวๆ (ไม่มี policy = แอปอ่าน/เขียนตรงไม่ได้ ใช้ผ่านฟังก์ชันเท่านั้น)
create table public.invite_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_time_idx on public.invite_attempts (user_id, attempted_at desc);
alter table public.invite_attempts enable row level security;
revoke all on public.invite_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- เข้าร่วมองค์กรด้วยรหัส
-- security definer เพราะผู้เรียกยังไม่ใช่สมาชิก จึงอ่าน organizations ขององค์กรนั้นตาม RLS ไม่ได้
-- (ต่างจาก submit_study_round ที่เป็น security invoker เพราะตอนนั้นผู้เรียกเป็นสมาชิกอยู่แล้ว ให้ RLS ตรวจตามปกติ)
-- ป้องกัน: ตรวจ auth.uid() ทุกครั้ง, search_path = '', ชื่อตารางระบุ schema, คืนผลแบบเดียวกันทั้งรหัสผิดและรหัสที่ถูกเปลี่ยนแล้ว
-- คืนค่าเป็น jsonb (ไม่ raise) เพื่อให้บันทึกการกรอกผิดลงตารางได้ (raise จะ rollback การบันทึกทิ้ง)
-- ---------------------------------------------------------------------------
create function public.join_organization(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text := public.normalize_invite_code(p_code);
  v_failures int;
  v_org      public.organizations%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select count(*) into v_failures
  from public.invite_attempts a
  where a.user_id = v_uid and not a.succeeded and a.attempted_at > now() - interval '15 minutes';
  if v_failures >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  select * into v_org from public.organizations o
  where length(v_code) = 10 and o.invite_code = v_code;

  if not found then
    insert into public.invite_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  insert into public.invite_attempts (user_id, succeeded) values (v_uid, true);

  if exists (select 1 from public.organization_members m where m.organization_id = v_org.id and m.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_member', 'organization_id', v_org.id, 'organization_name', v_org.name);
  end if;

  insert into public.organization_members (organization_id, user_id, role) values (v_org.id, v_uid, 'member');
  return jsonb_build_object('ok', true, 'organization_id', v_org.id, 'organization_name', v_org.name);
end;
$$;

-- ---------------------------------------------------------------------------
-- สร้างรหัสใหม่ (เฉพาะ owner) รหัสเก่าใช้ไม่ได้ทันทีเพราะถูกเขียนทับ
-- ---------------------------------------------------------------------------
create function public.rotate_invite_code(p_org uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is null or not public.has_org_role(p_org, array['owner']::public.org_role[]) then
    raise exception 'เฉพาะ Owner เท่านั้นที่สร้างรหัสเชิญใหม่ได้' using errcode = '42501';
  end if;
  update public.organizations set invite_code = public.generate_invite_code()
  where id = p_org
  returning invite_code into v_code;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- สร้างองค์กรใหม่ ตัวเองเป็น owner (organizations ไม่มี insert policy จึงต้องผ่านฟังก์ชันนี้)
-- ---------------------------------------------------------------------------
create function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_org  uuid;
begin
  if v_uid is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อน' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'กรุณากรอกชื่อองค์กร' using errcode = '22023';
  end if;
  -- กันสร้างรัวๆ: ไม่เกิน 10 องค์กรที่เป็น owner ต่อบัญชี
  if (select count(*) from public.organization_members m where m.user_id = v_uid and m.role = 'owner') >= 10 then
    raise exception 'สร้างองค์กรได้สูงสุด 10 แห่งต่อบัญชี' using errcode = '54000';
  end if;
  insert into public.organizations (name) values (v_name) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  return v_org;
end;
$$;

revoke execute on function public.join_organization(text) from public, anon;
revoke execute on function public.rotate_invite_code(uuid) from public, anon;
revoke execute on function public.create_organization(text) from public, anon;
grant execute on function public.join_organization(text) to authenticated;
grant execute on function public.rotate_invite_code(uuid) to authenticated;
grant execute on function public.create_organization(text) to authenticated;
revoke execute on function public.generate_invite_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ชื่อ Process ห้ามซ้ำภายในองค์กร (แทน unique ทั้งระบบ) แอปยังได้ error 23505 เหมือนเดิมเมื่อซ้ำในองค์กรเดียวกัน
-- ---------------------------------------------------------------------------
alter table public.process_groups drop constraint process_groups_name_key;
alter table public.process_groups add constraint process_groups_org_name_key unique (organization_id, name);

-- ---------------------------------------------------------------------------
-- สมัครพร้อมรหัสเชิญ: workspace_type = 'join' + invite_code ใน raw_user_meta_data
-- รหัสถูก → เป็น member ขององค์กรนั้น (ไม่สร้างพื้นที่ส่วนตัว), รหัสผิด → ได้พื้นที่ส่วนตัวตามเดิม
-- ---------------------------------------------------------------------------
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
  v_code    text := public.normalize_invite_code(new.raw_user_meta_data ->> 'invite_code');
  v_org     uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, v_name)
  on conflict (id) do nothing;

  if v_type = 'join' and length(v_code) = 10 then
    select o.id into v_org from public.organizations o where o.invite_code = v_code;
    if v_org is not null then
      insert into public.organization_members (organization_id, user_id, role) values (v_org, new.id, 'member');
      return new;
    end if;
  end if;

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

commit;
