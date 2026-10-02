-- ยกเลิกขั้นที่ 3: ปิด RLS ของตารางข้อมูล ให้ Dashboard แบบไม่ต้อง Login กลับมาเห็นข้อมูล
-- (policy เดิมก่อนขั้นที่ 3 ถูกลบไปแล้ว แต่เมื่อปิด RLS แล้ว policy จะไม่มีผล ข้อมูลจึงเปิดให้ทุกคนเหมือนเดิม)

begin;

do $$
declare
  t text;
begin
  foreach t in array array['process_groups', 'studies', 'steps', 'defect_logs'] loop
    execute format('alter table public.%I disable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon', t);
  end loop;
end;
$$;

commit;
