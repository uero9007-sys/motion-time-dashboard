-- ยกเลิกขั้นที่ 5: ผู้สมัครใหม่จะไม่ได้พื้นที่ของตัวเองอีก (บริษัทที่สร้างไปแล้วยังอยู่ ลบเองได้ถ้าต้องการ)
begin;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.profiles;
commit;
