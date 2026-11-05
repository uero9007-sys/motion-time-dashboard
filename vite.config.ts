import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages ไม่มี SPA fallback: path ที่ไม่มีไฟล์จริง (เช่น /join ของ QR เชิญ) จะได้ 404.html
// จึงคัดลอก index.html เป็น 404.html ให้แอปเปิดขึ้นมาแล้วอ่าน path เอง (ลบออก = ลิงก์ /join ขึ้นหน้า 404 ของ GitHub)
const spaFallback = (): Plugin => ({
  name: 'spa-fallback-404',
  apply: 'build',
  closeBundle() {
    copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'))
  },
})

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), spaFallback()],
  // build: path เต็มของ GitHub Pages (https://uero9007-sys.github.io/motion-time-dashboard/)
  // ห้ามใช้ './' เพราะเปิด /join/ (มี / ต่อท้าย) แล้วไฟล์ JS ถูกหาที่ /join/assets/ → 404 หน้าขาว
  // dev (npm run dev): '/' เหมือนเดิม  ·  npm run serve / preview: เปิดที่ http://<เครื่อง>:4173/motion-time-dashboard/
  base: command === 'build' ? '/motion-time-dashboard/' : '/',
  // ใช้เครื่องตัวเองเป็น Server ฉุกเฉิน: อนุญาตให้เปิดผ่าน Cloudflare Tunnel ได้
  server: { allowedHosts: ['.trycloudflare.com'] },
  preview: { allowedHosts: ['.trycloudflare.com'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
}))
