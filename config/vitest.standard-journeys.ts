import { defineConfig } from 'vitest/config'
import { createRendererConfig } from './renderer'

export default defineConfig({
  ...createRendererConfig(),
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/corpus/standardClassJourneys.test.tsx'],
  },
})
