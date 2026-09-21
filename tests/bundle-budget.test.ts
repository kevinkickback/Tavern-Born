import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'

import {
  BUNDLE_BUDGETS,
  evaluateBundleBudgets,
  measureBundle,
  validateBundledSrdPack,
} from '../scripts/check-bundle-budget.mjs'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function createSrdFixture(distributionStatus = 'approved-for-distribution') {
  const root = await mkdtemp(join(tmpdir(), 'tavern-born-srd-budget-'))
  temporaryRoots.push(root)
  await mkdir(join(root, 'data'), { recursive: true })
  const data = '{"action":[]}\n'
  const documents = [
    {
      version: '5.1',
      downloadUrl: 'https://example.com/srd.pdf',
      attribution: 'Fixture attribution.',
    },
  ]
  const license = { url: 'https://creativecommons.org/licenses/by/4.0/legalcode' }
  const transformationNotice = 'Fixture transformation notice.'
  const provenance = {
    packVersion: 'fixture-pack',
    distributionStatus,
    documents,
    license,
    transformationNotice,
  }
  const manifest = {
    packId: 'fixture-srd',
    packVersion: 'fixture-pack',
    distributionStatus,
    documents,
    license,
    transformationNotice,
    files: {
      'data/actions.json': createHash('sha256').update(data).digest('hex'),
    },
  }
  await Promise.all([
    writeFile(join(root, 'data', 'actions.json'), data),
    writeFile(join(root, 'manifest.json'), JSON.stringify(manifest)),
    writeFile(join(root, 'provenance.json'), JSON.stringify(provenance)),
    writeFile(
      join(root, 'THIRD_PARTY_NOTICES.md'),
      [
        'Pack version: fixture-pack',
        license.url,
        transformationNotice,
        documents[0].attribution,
        documents[0].downloadUrl,
      ].join('\n'),
    ),
  ])
  return root
}

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
  const measurements = measureBundle(buildFiles(), [
    { path: 'manifest.json', size: 200 },
    { path: 'data/actions.json', size: 300 },
  ])

  expect(measurements.bundledSrdPack).toBe(500)
  expect(measurements.applicationBundle).toBe(
    buildFiles().reduce((total, file) => total + file.size, 0),
  )
  expect(measurements.totalDistribution).toBe(
    buildFiles().reduce((total, file) => total + file.size, 0) + 500,
  )
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

test('accepts an approved bundled SRD pack with exact checksums and notices', async () => {
  const root = await createSrdFixture()

  await expect(validateBundledSrdPack(root)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: 'manifest.json' }),
      expect.objectContaining({ path: 'data/actions.json' }),
      expect.objectContaining({ path: 'THIRD_PARTY_NOTICES.md' }),
    ]),
  )
})

test('rejects a bundled SRD pack that still requires provenance review', async () => {
  const root = await createSrdFixture('provenance-review-required')

  await expect(validateBundledSrdPack(root)).rejects.toThrow(
    'requires approved-for-distribution metadata',
  )
})

test('rejects bundled SRD data that drifted from its manifest', async () => {
  const root = await createSrdFixture()
  await writeFile(join(root, 'data', 'actions.json'), '{"action":[{"name":"Changed"}]}\n')

  await expect(validateBundledSrdPack(root)).rejects.toThrow(
    'Bundled SRD checksum mismatch: data/actions.json',
  )
})

test('rejects packaged SRD data files absent from the manifest', async () => {
  const root = await createSrdFixture()
  await writeFile(join(root, 'data', 'unexpected.json'), '{}\n')

  await expect(validateBundledSrdPack(root)).rejects.toThrow(
    'data files do not exactly match the manifest checksum map',
  )
})

test('rejects stale packaged SRD notices', async () => {
  const root = await createSrdFixture()
  await writeFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'Pack version: fixture-pack\n')

  await expect(validateBundledSrdPack(root)).rejects.toThrow(
    'packaged third-party notices are incomplete or stale',
  )
})
