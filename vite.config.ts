import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/teacher-copilot/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '知昕 · 教师工作台',
        short_name: '知昕',
        description: '本地优先的班主任与教师工作助手',
        theme_color: '#f7f8f4',
        background_color: '#f7f8f4',
        display: 'standalone',
        orientation: 'portrait-primary',
        categories: ['education', 'productivity'],
        start_url: '/teacher-copilot/',
        icons: [
          { src: '/teacher-copilot/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
