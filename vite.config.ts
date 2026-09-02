import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  // Required for Electron: loadFile() uses file:// — relative paths must be used
  // so all asset references resolve from the dist/ directory, not the filesystem root.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
  build: {
    // Electron/Chromium supports module preloading natively; disable the inline
    // polyfill so it doesn't trigger the script-src CSP in production.
    modulePreload: { polyfill: false },
    // The largest remaining chunk is the lazy-loaded PDF engine (~593 kB minified).
    // Keep warnings just above that intentional boundary so future regressions still surface.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@cantoo/pdf-lib')) return 'vendor-pdf-lib'
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs'
          if (id.includes('/react-router')) return 'vendor-router'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react'
          }
          if (id.includes('@radix-ui') || id.includes('/cmdk/')) return 'vendor-ui'
          if (id.includes('@phosphor-icons') || id.includes('/lucide-react/')) {
            return 'vendor-icons'
          }
          if (
            id.includes('/react-markdown/') ||
            id.includes('/remark-') ||
            id.includes('/unified/') ||
            id.includes('/micromark') ||
            id.includes('/mdast-') ||
            id.includes('/hast-')
          ) {
            return 'vendor-markdown'
          }
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
