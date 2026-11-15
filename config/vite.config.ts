import { defineConfig, normalizePath, type Rollup } from 'vite'
import electron from 'vite-plugin-electron/simple'
import { createRendererConfig } from './renderer'

const renderer = createRendererConfig()

// Zod mentions pure annotations in prose in these two comments. See zod#6619.
const onwarn: Rollup.WarningHandlerWithDefault = (warning, warn) => {
  if (warning.code === 'INVALID_ANNOTATION' && warning.id) {
    const id = normalizePath(warning.id)
    if (
      (id.endsWith('/node_modules/zod/v4/core/regexes.js') &&
        warning.message.includes('Anchors a pattern source.')) ||
      (id.endsWith('/node_modules/zod/v4/core/util.js') &&
        warning.message.includes('Wrapped in a `@__PURE__` IIFE:'))
    )
      return
  }
  warn(warning)
}

// https://vite.dev/config/
export default defineConfig({
  ...renderer,
  define: { 'import.meta.env.DESKTOP_CATALOG_WORKER': 'true' },
  // Required for Electron: loadFile() uses file:// — relative paths must be used
  // so all asset references resolve from the dist/ directory, not the filesystem root.
  base: './',
  plugins: [
    ...renderer.plugins,
    electron({
      main: {
        entry: { main: 'electron/main.ts', catalogWorker: 'electron/catalogWorker.ts' },
        vite: { resolve: renderer.resolve, build: { rollupOptions: { onwarn } } },
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
  server: {
    watch: {
      // Temporary build and validation copies must not delay development startup.
      ignored: ['**/.tmp/**'],
    },
  },
  build: {
    // Electron/Chromium supports module preloading natively; disable the inline
    // polyfill so it doesn't trigger the script-src CSP in production.
    modulePreload: { polyfill: false },
    // The largest remaining chunk is the lazy-loaded PDF engine (~593 kB minified).
    // Keep warnings just above that intentional boundary so future regressions still surface.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      onwarn,
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@cantoo/pdf-lib')) return 'vendor-pdf-lib'
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs'
          if (id.includes('/zod/')) return 'vendor-schema'
          if (id.includes('/dompurify/')) return 'vendor-sanitize'
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
    ...renderer.resolve,
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Lazy routes must not discover shared UI dependencies after Electron has loaded Vite's
    // initial graph. A late optimizer pass replaces common chunks while an in-flight route may
    // still reference the earlier files.
    include: [
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-separator',
      '@radix-ui/react-toggle-group',
    ],
  },
})
