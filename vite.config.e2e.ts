import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Match development: private build/review trees must not delay browser-test startup.
    watch: { ignored: ['**/.tmp/**'] },
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@radix-ui/react-radio-group'],
  },
})
