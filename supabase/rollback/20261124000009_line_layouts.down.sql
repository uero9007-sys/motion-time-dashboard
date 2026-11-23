-- ยกเลิกขั้นที่ 9: ลบตารางผัง Line Balancing ของทีม
-- ⚠ ผังที่บันทึกไว้ในตารางนี้จะหายทั้งหมด (หน้า Line Balancing กลับไปเก็บในเบราว์เซอร์แต่ละเครื่อง)

begin;

drop table if exists public.line_layouts;
drop function if exists public.touch_line_layout();

commit;
