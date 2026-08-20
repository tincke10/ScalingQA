import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // En dev el SPA corre en vite y la API la sirve el server de node
    proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:8080' },
  },
})
