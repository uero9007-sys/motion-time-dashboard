# Motion & Time Study Dashboard

Dashboard สำหรับดูผลการจับเวลา (Motion & Time Study) ที่บันทึกไว้ใน Supabase แสดง KPI, กราฟแนวโน้ม, จำนวนรอบที่ควรจับเพิ่ม, การวิเคราะห์ราย Step, Line Balancing และ Export เป็นรายงาน PDF / Excel ข้อมูลดิบ

สร้างด้วย React 19 + TypeScript + Vite, Recharts, SheetJS (xlsx) และ Supabase

## เริ่มต้นใช้งาน

ต้องมี Node.js 20 ขึ้นไป

```bash
npm install
cp .env.example .env   # แล้วใส่ค่า Supabase ของโปรเจกต์
npm run dev            # เปิด http://localhost:5173
```

### ค่าใน `.env`

| ตัวแปร | ที่มา |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public key |
| `VITE_SKIP_LOGIN` | ไม่บังคับ: `true` = โหมดทดลอง เปิด Dashboard โดยไม่ต้อง Login |
| `VITE_ORG_ID` | ไม่บังคับ: id ของบริษัทที่จะแสดงในโหมดทดลอง (ว่าง = ไม่กรองตามบริษัท) |

ถ้าไม่ได้ใส่ค่าเหล่านี้ หน้าเว็บจะแสดงข้อความแจ้งแทนการโหลดข้อมูล

หลังแก้ `.env` ต้องหยุด dev server แล้วรัน `npm run dev` ใหม่ทุกครั้ง เพราะ Vite อ่านค่าตอนเริ่มเท่านั้น

### โหมดทดลอง (ไม่ต้อง Login)

ตั้ง `VITE_SKIP_LOGIN=true` แล้วแอปจะข้ามหน้า Login ไปเปิด Dashboard ทันที และซ่อนเมนู "สมาชิก" กับปุ่มออกจากระบบ

โหมดนี้เข้าถึงฐานข้อมูลด้วย anon key จึงเห็นข้อมูลได้เฉพาะตอนที่ยังไม่ได้รัน `20261002000003_enable_rls.sql`
ถ้ารันไปแล้ว Dashboard จะว่างเปล่า ต้องปิดโหมดนี้แล้ว Login ตามปกติ

> ค่า `VITE_*` จะถูกฝังอยู่ในไฟล์ JavaScript ที่ส่งให้เบราว์เซอร์ ทุกคนที่เปิดเว็บจึงเห็น anon key ได้
> ความปลอดภัยของข้อมูลจึงขึ้นอยู่กับ Row Level Security (RLS) ใน Supabase ห้ามใส่ `service_role` key ในไฟล์นี้

## ตารางใน Supabase ที่แอปใช้

| ตาราง | ใช้ทำอะไร | สิทธิ์ที่แอปต้องการ |
| --- | --- | --- |
| `process_groups` | Process ใหญ่ | อ่าน |
| `studies` | การจับเวลาแต่ละรอบ | อ่าน |
| `steps` | เวลาแต่ละ Step ของรอบ | อ่าน, แก้ไขคอลัมน์ `name` (เปลี่ยนชื่อ Step) |
| `defect_logs` | Defect ที่เกิดในแต่ละรอบ | อ่าน |

โครงสร้างคอลัมน์ดูได้ที่ [src/types.ts](src/types.ts)

## คำสั่ง

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | เปิด dev server พร้อม hot reload |
| `npm test` | รัน unit test (Vitest) ของสูตรคำนวณและการเตรียมข้อมูล Export |
| `npm run lint` | ตรวจโค้ดด้วย oxlint |
| `npm run build` | ตรวจ type แล้ว build ไฟล์ production ลง `dist/` |
| `npm run preview` | เปิดดูไฟล์ใน `dist/` |
| `npm run serve` | build แล้วเปิดให้เครื่องอื่นในวง LAN เข้าได้ที่ port 4173 |
| `npm run deploy` | build แล้ว deploy ขึ้น GitHub Pages (branch `gh-pages`) |

## โครงสร้างโค้ด

```
src/
  App.tsx              โหลดข้อมูลจาก Supabase, เก็บ state, เลือกหน้าที่จะแสดง
  pages/               หน้าหลักแต่ละเมนู (เลือก Process, การศึกษา, วิเคราะห์, Line Balancing, ตั้งค่า)
  components/          ส่วนประกอบของหน้า Process (กราฟ, Sample Size, ตาราง Study, รายงาน PDF)
  lib/ie.ts            สูตร IE: Standard Time, Efficiency, ค่า k, จำนวนรอบที่ต้องจับ
  lib/export.ts        เตรียมข้อมูลและสร้างไฟล์ Excel ข้อมูลดิบ
  lib/settings.ts      การตั้งค่าที่เก็บใน localStorage ของแต่ละเบราว์เซอร์
```

สูตรคำนวณที่ใช้:

- **Normal Time** = เวลาที่จับได้ × Rating / 100
- **Standard Time** = Σ Normal Time × (1 + Allowance / 100)
- **Efficiency** = Standard Time / เวลาจริง × 100
- **จำนวนรอบที่ควรจับ** N = (k · s / (h · x̄))² ปัดขึ้น โดย k = 1.645 / 1.96 / 2.576 ที่ความเชื่อมั่น 90 / 95 / 99%

ถ้าแก้สูตรใน `lib/` ให้รัน `npm test` ทุกครั้ง

## Deploy

`vite.config.ts` ตั้ง `base: './'` ไว้ ไฟล์ที่ build ออกมาจึงเปิดได้ทั้งบน Vercel และ GitHub Pages

- **Vercel**: โปรเจกต์เชื่อมไว้แล้ว (`.vercel/`) ต้องตั้งค่า `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ใน Environment Variables ของ Vercel ด้วย
- **GitHub Pages**: `npm run deploy` จะใช้ค่าจาก `.env` ในเครื่องตอน build
