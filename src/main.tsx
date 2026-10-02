import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// ถ้าไม่มีค่า Supabase ใน .env การสร้าง client จะ error ตั้งแต่โหลดไฟล์ จึงตรวจก่อนแล้วค่อยโหลด App
const missingEnv = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !import.meta.env[key])

if (missingEnv.length > 0) {
  root.render(
    <div style={{ padding: 32, fontFamily: 'sans-serif', lineHeight: 1.6 }}>
      <h1>ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล</h1>
      <p>ไม่พบค่าต่อไปนี้ในไฟล์ <code>.env</code>: <code>{missingEnv.join(', ')}</code></p>
      <p>ดูวิธีตั้งค่าได้ใน README.md แล้วรีสตาร์ท dev server</p>
    </div>,
  )
} else {
  import('./components/AuthGate.tsx').then(({ default: AuthGate }) => {
    root.render(
      <StrictMode>
        <AuthGate />
      </StrictMode>,
    )
  })
}
