import { defineConfig } from 'vite'
import { createRendererConfig } from './renderer'

const renderer = createRendererConfig()

export default defineConfig({
  ...renderer,
  server: {
    // Match development: private build/review trees must not delay browser-test startup.
    watch: { ignored: ['**/.tmp/**'] },
  },
  resolve: {
    ...renderer.resolve,
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@radix-ui/react-radio-group'],
  },
})
