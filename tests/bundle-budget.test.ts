import { expect, test } from 'vitest'

import {
  BUNDLE_BUDGETS,
  evaluateBundleBudgets,
  measureBundle,
} from '../scripts/check-bundle-budget.mjs'

const buildFiles = (overrides: Partial<Record<string, number>> = {}) => [
  { path: 'index.html', size: 4_000 },
  {
    path: 'assets/index-build.js',
    size: overrides.initialRendererScript ?? BUNDLE_BUDGETS.initialRendererScript,
  },
  {
    path: 'assets/index-build.css',
    size: overrides.initialStylesheet ?? BUNDLE_BUDGETS.initialStylesheet,
  },
  {
    path: 'assets/vendor-build.js',
    size: overrides.largestLazyScript ?? BUNDLE_BUDGETS.largestLazyScript,
  },
  { path: 'assets/pdf.worker-build.mjs', size: overrides.pdfWorker ?? BUNDLE_BUDGETS.pdfWorker },
  { path: 'assets/images/logo.png', size: overrides.staticAsset ?? 1_000 },
]

test('measures stable production bundle categories', () => {
  const measurements = measureBundle(buildFiles())

  expect(measurements.initialRendererScript).toBe(BUNDLE_BUDGETS.initialRendererScript)
  expect(measurements.initialStylesheet).toBe(BUNDLE_BUDGETS.initialStylesheet)
  expect(measurements.largestLazyScript).toBe(BUNDLE_BUDGETS.largestLazyScript)
  expect(measurements.pdfWorker).toBe(BUNDLE_BUDGETS.pdfWorker)
  expect(measurements.staticAssets).toBe(1_000)
})

test('reports every exceeded budget with its actual and limit', () => {
  const measurements = {
    ...BUNDLE_BUDGETS,
    initialRendererScript: BUNDLE_BUDGETS.initialRendererScript + 1,
    staticAssets: BUNDLE_BUDGETS.staticAssets + 2,
  }

  expect(evaluateBundleBudgets(measurements)).toEqual([
    {
      name: 'staticAssets',
      actual: BUNDLE_BUDGETS.staticAssets + 2,
      limit: BUNDLE_BUDGETS.staticAssets,
    },
    {
      name: 'initialRendererScript',
      actual: BUNDLE_BUDGETS.initialRendererScript + 1,
      limit: BUNDLE_BUDGETS.initialRendererScript,
    },
  ])
})

test('rejects output without a unique initial renderer artifact', () => {
  expect(() => measureBundle(buildFiles().filter((file) => !file.path.endsWith('.css')))).toThrow(
    'Expected one initial stylesheet',
  )
})
