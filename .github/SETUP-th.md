# ตั้งค่า CI/CD (GitHub Actions)

## 1. เพิ่ม Secrets 2 ตัว
ไปที่ repo `uero9007-sys/motion-time-dashboard` → Settings → Secrets and variables → Actions → New repository secret

| ชื่อ | ค่า |
|---|---|
| `VITE_SUPABASE_URL` | Project URL ของ Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon (public) key ของ Supabase |

## 2. ตั้งสิทธิ์ Workflow
Settings → Actions → General → Workflow permissions → เลือก "Read and write permissions" (ถ้า deploy ขึ้น error 403)

## 3. วิธีกดปุ่ม Deploy
1. ไปที่แท็บ Actions → เลือก workflow "Deploy" ทางซ้าย
2. กด "Run workflow" → เลือก branch (`main`) → กด "Run workflow"
3. รอจนผ่าน (test, lint, build แล้วจึงเผยแพร่ไปที่ branch `gh-pages`)

การ deploy ใช้ `keep_files: true` จึงไม่ลบไฟล์เดิมใน `gh-pages` (โฟลเดอร์ `/app` ของแอป Expo web ยังอยู่)

CI (`ci.yml`) จะรันเองทุกครั้งที่ push และ pull request

## คำเตือนเรื่องความปลอดภัย
- anon key ออกแบบมาให้เป็น public (อยู่ในโค้ดฝั่งเบราว์เซอร์อยู่แล้ว) ปลอดภัยถ้าเปิด RLS ถูกต้อง
- ห้ามนำ `service_role` key ใส่ใน Secrets นี้หรือในโค้ด frontend เด็ดขาด เพราะข้าม RLS ได้ทั้งหมด และจะถูกฝังใน bundle ที่ทุกคนเห็น
