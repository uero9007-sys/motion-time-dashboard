-- ยกเลิกขั้นที่ 8: ปิด Realtime ของ studies และ steps (Dashboard กลับไปกดรีเฟรชเอง ข้อมูลไม่หาย)

begin;

do $$
declare
  t text;
begin
  foreach t in array array['studies', 'steps'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end
$$;

commit;
