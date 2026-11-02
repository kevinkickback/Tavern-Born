import { defineConfig } from 'vitest/config'
import { createRendererConfig } from './config/renderer'

const domTests = [
  'tests/{hooks,store,integration}/**/*.{test,spec}.{ts,tsx}',
  'tests/**/*.{test,spec}.tsx',
]

export default defineConfig({
  ...createRendererConfig(),
  test: {
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.{test,spec}.{ts,tsx}'],
          exclude: domTests,
        },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: domTests },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx', 'src/App.tsx', 'src/**/*.stories.{ts,tsx}'],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 57,
        lines: 63,
      },
    },
  },
})
