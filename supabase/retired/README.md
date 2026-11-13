# migrations ที่เลิกใช้

`20261003000004_child_org_from_study.sql` ไม่เคยรันบนฐานข้อมูลจริง และไม่ควรรัน: trigger แบบ security definer ข้าม RLS และซ้ำกับ trigger ของ migration 1 (ดู supabase/audit/) migration 7 รองรับกรณีที่ไม่ได้รันไฟล์นี้แล้ว
