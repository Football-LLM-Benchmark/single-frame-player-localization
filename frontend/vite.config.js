import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/single-frame-player-localization/',
  server: {
    port: 8000,
  },
})
