import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { telemetryChunk } from './build/telemetryChunk'
import { visualizer } from 'rollup-plugin-visualizer'

// `ANALYZE=1 npm run build` opens dist/bundle-stats.html with a treemap of
// the final chunks — use it before tweaking manualChunks below so the split
// is informed by real composition, not guesses.
const analyze = process.env.ANALYZE === '1'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_URL || '/',
  // The retryable chart URL is intentionally opaque to Vite's import scanner.
  // Discover its vendor up front so first chart open cannot trigger a reload.
  optimizeDeps: { include: ['recharts'] },
  plugins: [
    react(),
    telemetryChunk(),
    tailwindcss(),
    ...(analyze
      ? [
          visualizer({
            filename: 'dist/bundle-stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // One retryable chart module; shared startup dependencies keep their chunks.
          if (id.endsWith('/src/utils/formatTime.ts')) return 'app-shared'
          if (id.endsWith('/src/components/TelemetryChart.tsx')) return 'charts-vendor'

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

          // troika (drei <Text>) pulls bidi-js + webgl-sdf-generator and totals
          // ~150 KB on its own. Splitting it out shrinks drei-vendor for users
          // who don't render text-heavy scenes.
          if (
            id.includes('/troika-') ||
            id.includes('/bidi-js/') ||
            id.includes('/webgl-sdf-generator/')
          ) {
            return 'troika-vendor'
          }

          if (
            id.includes('/@react-three/drei/') ||
            id.includes('/three-stdlib/') ||
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
