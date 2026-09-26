import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/poll': 'http://backend:8001',
      '/vote': 'http://backend:8001',
      '/ws': {
        target: 'ws://backend:8001',
        ws: true,
      },
    },
  },
})
