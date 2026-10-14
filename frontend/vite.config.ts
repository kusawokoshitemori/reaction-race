import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: apiTarget, ws: true } } },
  preview: { proxy: { '/api': { target: apiTarget, ws: true } } },
})
