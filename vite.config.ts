import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // Object form: Vite's string shorthand sets changeOrigin, which rewrites Host and breaks the API's same-origin check.
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787' } } },
})
