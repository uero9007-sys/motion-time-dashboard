import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // ใช้ path แบบ relative เพื่อให้เปิดได้ทั้งบน Vercel และ GitHub Pages (https://<user>.github.io/<repo>/)
  base: './',
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
})
