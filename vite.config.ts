import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
            return 'react-vendor'
          }

          if (id.includes('/@react-three/fiber/')) {
            return 'r3f-vendor'
          }

          if (id.includes('/three/examples/')) {
            return 'three-examples-vendor'
          }

          if (
            id.includes('/@react-three/drei/') ||
            id.includes('/three-stdlib/') ||
            id.includes('/troika-') ||
            id.includes('/camera-controls/') ||
            id.includes('/meshline/')
          ) {
            return 'drei-vendor'
          }

          if (id.includes('/three/')) {
            return 'three-vendor'
          }

          if (id.includes('/recharts/') || id.includes('/d3-')) {
            return 'charts-vendor'
          }
        },
      },
    },
  },
})
