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
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
