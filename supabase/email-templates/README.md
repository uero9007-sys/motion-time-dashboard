# อีเมลของระบบ MTS (Supabase Auth)

ไฟล์ในโฟลเดอร์นี้คือหน้าตาอีเมลที่ Supabase ส่งให้ผู้ใช้ แอปไม่ได้อ่านไฟล์เหล่านี้เอง
ต้องนำไปวางใน Supabase ด้วยมือ (Dashboard เข้าถึงการตั้งค่านี้ผ่าน anon key ไม่ได้)

## 1. วางเทมเพลต

Supabase → Authentication → Emails → Templates เลือกทีละแบบ วาง HTML ทั้งไฟล์ในช่อง Body แล้วตั้งหัวเรื่อง (Subject):

| เทมเพลตใน Supabase | ไฟล์ | หัวเรื่อง |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | ยืนยันอีเมลของคุณสำหรับ MTS Motion & Time Study |
| Magic Link | `magic-link.html` | ลิงก์เข้าสู่ระบบ MTS Motion & Time Study |
| Reset Password | `reset-password.html` | ตั้งรหัสผ่านใหม่สำหรับ MTS Motion & Time Study |

ตัวแปรที่ใช้: `{{ .ConfirmationURL }}` (ลิงก์ที่ Supabase สร้าง) และ `{{ .Email }}` (อีเมลผู้รับ) ห้ามลบ

## 2. ตั้งชื่อผู้ส่งเป็นชื่อแอป (ต้องใช้ SMTP ของตัวเอง)

อีเมลจาก Supabase ค่าเริ่มต้นส่งในชื่อและที่อยู่ของ Supabase และจำกัดจำนวนต่อชั่วโมงไว้ต่ำมาก (เหมาะกับการทดสอบเท่านั้น)
จะให้ขึ้นชื่อ "MTS Motion & Time Study" ต้องตั้งค่า SMTP เอง:

1. สมัครบริการส่งอีเมลที่มี SMTP (เช่น Resend, Brevo, Amazon SES หรือ SMTP ของอีเมลบริษัท)
2. Supabase → Authentication → Emails → SMTP Settings → เปิด "Enable Custom SMTP"
3. กรอก Sender email (เช่น `no-reply@โดเมนของคุณ`), Sender name `MTS Motion & Time Study`, Host, Port, Username, Password จากผู้ให้บริการ
4. ถ้ามีโดเมนของตัวเอง ให้ตั้ง SPF / DKIM ตามที่ผู้ให้บริการบอก ไม่งั้นอีเมลมักตกไปที่ Spam

## 3. ลิงก์ยืนยันพาไปที่ไหน

Supabase → Authentication → URL Configuration
- Site URL: `https://uero9007-sys.github.io/motion-time-dashboard/`
- Redirect URLs: ใส่ที่อยู่เดียวกัน (และที่อยู่ทดสอบ เช่น `http://localhost:5173/` ถ้าต้องการ)

กดยืนยันแล้ว ผู้ใช้จะไปที่ Dashboard และเห็นข้อความ "ยืนยันอีเมลเรียบร้อยแล้ว"
ส่วนแอปหรือหน้าเว็บที่กดสมัครไว้จะเข้าสู่ระบบให้เองภายในไม่กี่วินาทีหลังผู้ใช้กลับมา (ดู `src/lib/verify.ts` และ `lib/verifyWatch.ts` ของแอป)

## แก้เทมเพลต

เนื้อหาทั้ง 3 ไฟล์ใช้โครงเดียวกัน แก้ข้อความในไฟล์ได้ตรงๆ แล้ววางใน Supabase ใหม่
อีเมลใช้ตารางและ style ในบรรทัด เพราะโปรแกรมอีเมลส่วนใหญ่ไม่รองรับ CSS แบบหน้าเว็บ
