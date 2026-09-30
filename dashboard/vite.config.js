import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // All /api/* calls → Node.js/Express backend (3001)
      // Node backend internally proxies ML calls to Flask (5000)
      '/api': {
        target: 'https://bhudrishti-backend-9mrh.onrender.com',
        changeOrigin: true,
      },
    },
  },
})
