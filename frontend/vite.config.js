import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `--mode staging` builds the copy served at lpcote.ca/mitaines-dev (separate
// containers + DB) so changes can be tested without touching prod /mitaines.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  base: mode === 'staging' ? '/mitaines-dev/' : '/mitaines/',
  build: {
    outDir: 'dist',
  },
}))
