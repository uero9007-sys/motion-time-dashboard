# เช็กลิสต์ก่อนเปิดใช้งานจริง (สำหรับเจ้าของระบบ)

รายการที่ต้องทำเองในหน้า Dashboard ของแต่ละบริการ ทำตามลำดับจากบนลงล่าง
หมายเหตุ: ชื่อเมนูของ Supabase / ผู้ให้บริการอาจเปลี่ยนได้ ข้อที่ไม่แน่ใจจะมีป้าย "(ชื่อเมนูอาจต่างเล็กน้อย)"

## 1. URL Configuration (ลิงก์ยืนยันอีเมลและลิงก์เชิญ)

Supabase → เลือกโปรเจกต์ → Authentication → URL Configuration (ชื่อเมนูอาจต่างเล็กน้อย)

- [ ] Site URL = `https://uero9007-sys.github.io/motion-time-dashboard/`
- [ ] Redirect URLs กด Add URL แล้วเพิ่มทีละบรรทัด:
  - [ ] `https://uero9007-sys.github.io/motion-time-dashboard/`
  - [ ] `https://uero9007-sys.github.io/motion-time-dashboard/join`
  - [ ] `https://uero9007-sys.github.io/motion-time-dashboard/app` (เว็บบิลด์ของแอป) หรือใช้ `https://uero9007-sys.github.io/motion-time-dashboard/**` ตัวเดียวครอบทุกหน้า
  - [ ] (ถ้าต้องการทดสอบ) `http://localhost:5173/**`
- [ ] กด Save
- [ ] ถ้าใช้โดเมนของตัวเอง (ดูข้อ 8): เพิ่ม Site URL และ Redirect URLs ชุดใหม่ด้วยโดเมนนั้น (เช่น `https://mts.example.com/`, `https://mts.example.com/join`, `https://mts.example.com/app`) และเก็บชุดเดิมไว้จนกว่าลิงก์เชิญเก่าจะหมดอายุ

## 2. Custom SMTP (ให้อีเมลขึ้นชื่อ MTS และไม่ตกสแปม)

อีเมลเริ่มต้นของ Supabase จำกัดจำนวนต่อชั่วโมงต่ำมาก ใช้จริงไม่ได้

- [ ] สมัครผู้ให้บริการอีเมล เช่น Resend หรือ Brevo
- [ ] เพิ่มโดเมนผู้ส่งในผู้ให้บริการ แล้วนำค่า DNS ที่เขาให้ไปใส่ที่ผู้ให้บริการโดเมนของคุณ:
  - [ ] SPF (TXT) ตามที่ผู้ให้บริการระบุ
  - [ ] DKIM (TXT หรือ CNAME) ตามที่ผู้ให้บริการระบุ
  - [ ] (แนะนำ) DMARC (TXT ชื่อ `_dmarc`) เช่น `v=DMARC1; p=none`
  - [ ] รอจนผู้ให้บริการขึ้นสถานะ Verified
- [ ] Supabase → Authentication → Emails → SMTP Settings → เปิด Enable Custom SMTP (ชื่อเมนูอาจต่างเล็กน้อย)
- [ ] กรอกค่า:
  - Sender email: `no-reply@โดเมนของคุณ`
  - Sender name: `MTS Motion & Time Study`
  - ตัวอย่าง Resend: Host `smtp.resend.com`, Port `465`, Username `resend`, Password = API key ของ Resend
  - ตัวอย่าง Brevo: Host `smtp-relay.brevo.com`, Port `587`, Username = SMTP login ที่หน้า SMTP & API ของ Brevo, Password = SMTP key
  - ค่าข้างต้นให้ตรวจกับเอกสารของผู้ให้บริการอีกครั้งก่อนใช้
- [ ] Save แล้วทดสอบสมัครด้วยอีเมลจริง 1 อีเมล ตรวจว่าไม่ตกสแปม

## 3. วางเทมเพลตอีเมล 3 แบบ

- [ ] ทำตาม `supabase/email-templates/README.md` ข้อ 1: Authentication → Emails → Templates วางไฟล์ `confirm-signup.html`, `magic-link.html`, `reset-password.html` และตั้ง Subject ตามตารางในไฟล์นั้น
- [ ] ห้ามลบตัวแปร `{{ .ConfirmationURL }}` และ `{{ .Email }}`

## 4. Attack Protection

Supabase → Authentication → Attack Protection (ชื่อเมนูอาจต่างเล็กน้อย)

- [ ] เปิด Leaked password protection (ตรวจรหัสผ่านที่เคยรั่ว) (ฟีเจอร์นี้อาจใช้ได้เฉพาะแผน Pro ขึ้นไป ดูหน้าจอจริง)
- [ ] CAPTCHA: เปิด Enable CAPTCHA protection เลือก Cloudflare Turnstile
  - [ ] สมัคร Cloudflare → Turnstile → Add widget ใส่โดเมน (`uero9007-sys.github.io`) แล้วคัดลอก Site key และ Secret key
  - [ ] วาง Secret key ในช่อง CAPTCHA ของ Supabase
  - [ ] **ยังไม่ได้ทำในโค้ด**: ต้องแก้โค้ดหน้าล็อกอิน/สมัคร (ใส่วิดเจ็ต Turnstile และส่ง `captchaToken` ตอนเรียก signUp / signIn) ถ้าเปิด CAPTCHA ใน Supabase ก่อนแก้โค้ด จะสมัคร/ล็อกอินไม่ได้ จึง **อย่าเปิดจนกว่าโค้ดจะพร้อม**

## 5. Rate Limits

Supabase → Authentication → Rate Limits (ชื่อเมนูอาจต่างเล็กน้อย)

- [ ] ตรวจจำนวนอีเมลต่อชั่วโมง (เมื่อใช้ Custom SMTP จะปรับได้) ตั้งให้พอกับจำนวนผู้ใช้ที่คาดว่าจะสมัครพร้อมกัน
- [ ] ตรวจจำนวนการสมัคร/ล็อกอินต่อ IP ต่อช่วงเวลา ปล่อยค่าเริ่มต้นได้ถ้าไม่มีปัญหา

## 6. เลือกแผน (Plan)

Supabase → Organization → Billing (ชื่อเมนูอาจต่างเล็กน้อย)

- [ ] **Free**: โปรเจกต์ถูก pause เมื่อไม่มีการใช้งาน 7 วัน (กด Restore ได้ แต่ผู้ใช้จะใช้งานไม่ได้ระหว่างนั้น) และไม่มีสำรองข้อมูลรายวันอัตโนมัติ
- [ ] **Pro**: ไม่ pause มีสำรองข้อมูลรายวัน และใช้ฟีเจอร์ความปลอดภัยได้ครบกว่า (ตรวจราคาและเงื่อนไขล่าสุดที่หน้า Pricing ของ Supabase)
- [ ] ตัดสินใจ: ใช้งานจริงกับผู้ใช้หลายคนหรือข้อมูลสำคัญ แนะนำ Pro ถ้าอยู่ Free ให้ตั้งเตือนเข้าใช้อย่างน้อยสัปดาห์ละครั้ง และสำรองข้อมูลเองตามข้อ 7

## 7. สำรองข้อมูลด้วยตนเอง

- [ ] วิธีง่าย (ข้อมูลในตาราง): Supabase → Table Editor → เลือกตาราง → ปุ่ม Export → CSV (ชื่อเมนูอาจต่างเล็กน้อย) ทำทีละตาราง
- [ ] วิธีเต็ม: Supabase → Database → Backups (ชื่อเมนูอาจต่างเล็กน้อย) ดาวน์โหลดไฟล์สำรอง (แผน Pro) หรือใช้ Supabase CLI: `supabase db dump -f backup.sql` (ต้องล็อกอินและ link โปรเจกต์ก่อน)
- [ ] เก็บไฟล์สำรองไว้นอก Supabase (เช่น Google Drive) และกำหนดรอบ เช่น ทุกสัปดาห์
- [ ] ทดลองเปิดไฟล์สำรองอย่างน้อยหนึ่งครั้งว่าอ่านได้

## 8. (ตัวเลือก) โดเมนของตัวเองบน GitHub Pages

- [ ] ซื้อโดเมน แล้วที่ DNS: ถ้าเป็นซับโดเมน (เช่น `mts.example.com`) สร้างระเบียน CNAME ชี้ไป `uero9007-sys.github.io`; ถ้าเป็นโดเมนหลัก ให้ใส่ระเบียน A ตามที่เอกสาร GitHub Pages ระบุ (ตรวจ IP ล่าสุดจากเอกสาร GitHub)
- [ ] GitHub → repo `motion-time-dashboard` → Settings → Pages → Custom domain ใส่โดเมน → Save
- [ ] รอให้ DNS check ผ่าน แล้วติ๊ก Enforce HTTPS
- [ ] ผลที่ตามมา (ต้องแก้โค้ดและ build ใหม่):
  - [ ] Vite `base` ใน `vite.config` ต้องเปลี่ยนจาก `/motion-time-dashboard/` เป็น `/`
  - [ ] ลิงก์ใน `index.html` (og:url, og:image, twitter:image) ต้องเปลี่ยนเป็นโดเมนใหม่
  - [ ] QR / ลิงก์เชิญ (`/join`) ที่แจกไปแล้วจะชี้ที่อยู่เก่า ต้องสร้างและแจกใหม่
  - [ ] เพิ่ม Site URL / Redirect URLs ใหม่ใน Supabase (ข้อ 1) และแก้ที่อยู่ในแอปมือถือ/เว็บบิลด์ที่อ้างถึงโดเมนเก่า
  - [ ] ถ้าใช้ Turnstile ให้เพิ่มโดเมนใหม่ใน widget ด้วย

## 9. SQL ที่ต้องรันใน Supabase → SQL Editor

- [ ] ตรวจว่ารันขั้นที่ 7 แล้วหรือยัง: `select proname from pg_proc where proname = 'submit_study_round';` ได้ 1 แถว = รันแล้ว ถ้าไม่ได้ ให้รัน `supabase/migrations/20261111000007_submit_round_and_trigger_cleanup.sql`
- [ ] รันขั้นที่ 8 `supabase/migrations/20261124000008_realtime.sql` (Dashboard อัปเดตเองเมื่อมีรอบใหม่ และขึ้นป้าย "อัปเดตอัตโนมัติ" ข้างปุ่มรีเฟรช)
- [ ] รันขั้นที่ 9 `supabase/migrations/20261124000009_line_layouts.sql` (ผัง Line Balancing ที่บันทึกไว้ ทุกคนในองค์กรเห็นร่วมกัน ผังเก่าในเบราว์เซอร์กด "ย้ายขึ้นให้ทีมเห็น" ได้)
- [ ] (ถ้าต้องการ) ลบข้อมูลจำลองที่ใช้ทดสอบ: `supabase/maintenance/delete_simulated_data.sql` ดูส่วนที่ 1 ก่อน และสำรองข้อมูลก่อนลบ (Dashboard → ตั้งค่า → ดาวน์โหลดไฟล์สำรอง)
- [x] ขั้นที่ 7 รันแล้ว (ตรวจเมื่อ 24 พ.ย. 2569: ฟังก์ชัน submit_study_round มีอยู่ในฐานข้อมูลจริง)
- [ ] ถ้าใช้แผน Free: โปรเจกต์ถูกพักเมื่อไม่มีคนใช้ ~7 วัน อาการคือล็อกอินแล้วขึ้น "ติดต่อเซิร์ฟเวอร์ข้อมูลไม่ได้ (เน็ตของคุณใช้ได้ปกติ)" แก้ที่ supabase.com/dashboard → Restore project

## 10. ตรวจสอบรอบสุดท้าย

- [ ] สมัครสมาชิกใหม่ด้วยอีเมลจริง → ได้อีเมลชื่อ MTS → กดยืนยัน → เข้าระบบได้
- [ ] เปิดลิงก์เชิญ `/join` จากมือถือแล้วเข้าร่วมได้
- [ ] แปะลิงก์เว็บใน LINE / Facebook ดูว่าการ์ดตัวอย่าง (รูป og-image) ขึ้น (ถ้าไม่ขึ้นใช้ Facebook Sharing Debugger ล้างแคช)
