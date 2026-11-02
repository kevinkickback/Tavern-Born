import { defineConfig } from 'vitest/config'
import base from '../vitest.config'

// A partial suite collects evidence; the normal root config judges the combined coverage.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      reporter: [],
      thresholds: undefined,
    },
  },
})
