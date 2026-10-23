import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Бэкенд для `npm run dev`; по умолчанию — Docker на :8080. Переопределить: API_TARGET=http://localhost:8099
const api = process.env.API_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': api, '/ws': { target: api.replace(/^http/, 'ws'), ws: true } } },
})
