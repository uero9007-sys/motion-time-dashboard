// npm run deploy — ส่ง dist ขึ้น branch gh-pages (-a เก็บไฟล์เดิม เช่น /app ของแอปมือถือ, -t รวมไฟล์ .nojekyll)
// เปิด core.longpaths เฉพาะคำสั่งนี้: ไฟล์ฟอนต์ของแอปใน app/assets/node_modules/... มีพาธยาวเกิน 260 ตัวอักษร
// ของ Windows เมื่อ gh-pages clone ลงโฟลเดอร์ cache ทำให้ deploy ล้มด้วย "Filename too long"
import { spawnSync } from 'node:child_process';

const env = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.longpaths', GIT_CONFIG_VALUE_0: 'true' };
const r = spawnSync('npx', ['gh-pages', '-d', 'dist', '-a', '-t'], { stdio: 'inherit', shell: true, env });
process.exit(r.status ?? 1);
