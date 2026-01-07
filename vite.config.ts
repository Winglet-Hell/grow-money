import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'recharts': ['recharts'],
          'db-vendor': ['dexie', 'dexie-react-hooks'],
          'ui-libs': ['lucide-react', 'clsx', 'tailwind-merge', 'classnames'],
          'supabase-vendor': ['@supabase/supabase-js']
        }
      }
    }
  },
  worker: {
    format: 'es'
  }
})
