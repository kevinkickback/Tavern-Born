import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const KIB = 1024
const MIB = 1024 * KIB

export const BUNDLE_BUDGETS = Object.freeze({
  totalDistribution: 25 * MIB,
  bundledSrdPack: 5.25 * MIB,
  applicationBundle: 19 * MIB,
  staticAssets: 13 * MIB,
  rendererCode: 5.25 * MIB,
  // Reviewed at 426.9 KiB with source-qualified subclass choices, filtered-rule rebuilding,
  // and inactive replacement-choice state in the startup data graph.
  initialRendererScript: 428 * KIB,
  initialStylesheet: 185 * KIB,
  largestLazyScript: 620 * KIB,
  pdfWorker: 2.2 * MIB,
})

const normalizePath = (path) => path.replaceAll('\\', '/')
const formatBytes = (bytes) => `${(bytes / KIB).toFixed(1)} KiB`
const APPROVED_DISTRIBUTION_STATUS = 'approved-for-distribution'
const PACKAGED_SRD_FILE = /^(?:data\/.+\.json|manifest\.json|THIRD_PARTY_NOTICES\.md)$/

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return collectFiles(root, path)
      if (!entry.isFile()) return []
      const { size } = await stat(path)
      return [{ path: normalizePath(relative(root, path)), size }]
    }),
  )
  return files.flat()
}

function requireSingle(files, pattern, label) {
  const matches = files.filter((file) => pattern.test(file.path))
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${label}; found ${matches.length}. Build output may have changed.`,
    )
  }
  return matches[0]
}

export function measureBundle(files, bundledSrdFiles = []) {
  const initialScript = requireSingle(files, /^assets\/index-[^/]+\.js$/, 'initial renderer script')
  const initialStylesheet = requireSingle(files, /^assets\/index-[^/]+\.css$/, 'initial stylesheet')
  const pdfWorker = requireSingle(files, /^assets\/pdf\.worker-[^/]+\.mjs$/, 'PDF worker')
  const rendererCodeFiles = files.filter(
    (file) =>
      file.path.startsWith('assets/') && ['.css', '.js', '.mjs'].includes(extname(file.path)),
  )
  const lazyScripts = rendererCodeFiles.filter(
    (file) => extname(file.path) === '.js' && file.path !== initialScript.path,
  )
  const staticAssetFiles = files.filter((file) => {
    const extension = extname(file.path)
    return !['.css', '.html', '.js', '.map', '.mjs'].includes(extension)
  })

  return {
    totalDistribution:
      files.reduce((sum, file) => sum + file.size, 0) +
      bundledSrdFiles.reduce((sum, file) => sum + file.size, 0),
    bundledSrdPack: bundledSrdFiles.reduce((sum, file) => sum + file.size, 0),
    applicationBundle: files.reduce((sum, file) => sum + file.size, 0),
    staticAssets: staticAssetFiles.reduce((sum, file) => sum + file.size, 0),
    rendererCode: rendererCodeFiles.reduce((sum, file) => sum + file.size, 0),
    initialRendererScript: initialScript.size,
    initialStylesheet: initialStylesheet.size,
    largestLazyScript: Math.max(0, ...lazyScripts.map((file) => file.size)),
    pdfWorker: pdfWorker.size,
  }
}

const checksum = (contents) => createHash('sha256').update(contents).digest('hex')

async function readRequiredJson(root, relativePath) {
  try {
    return JSON.parse(await readFile(resolve(root, relativePath), 'utf8'))
  } catch (error) {
    throw new Error(`Bundled SRD ${relativePath} is missing or invalid JSON.`, { cause: error })
  }
}

function assertMatchingMetadata(manifest, provenance, field) {
  if (!isDeepStrictEqual(manifest[field], provenance[field])) {
    throw new Error(`Bundled SRD manifest ${field} does not match provenance.json.`)
  }
}

export async function validateBundledSrdPack(resourceDirectory = resolve('resources/srd/core')) {
  const files = await collectFiles(resourceDirectory)
  const packagedFiles = files.filter((file) => PACKAGED_SRD_FILE.test(file.path))
  const packagedPaths = new Set(packagedFiles.map((file) => file.path))
  const manifest = await readRequiredJson(resourceDirectory, 'manifest.json')
  const provenance = await readRequiredJson(resourceDirectory, 'provenance.json')

  if (
    manifest.distributionStatus !== APPROVED_DISTRIBUTION_STATUS ||
    provenance.distributionStatus !== APPROVED_DISTRIBUTION_STATUS
  ) {
    throw new Error(
      `Bundled SRD release packaging requires ${APPROVED_DISTRIBUTION_STATUS} metadata.`,
    )
  }
  if (
    typeof manifest.packId !== 'string' ||
    manifest.packId.length === 0 ||
    typeof manifest.packVersion !== 'string' ||
    manifest.packVersion.length === 0 ||
    manifest.packVersion !== provenance.packVersion
  ) {
    throw new Error('Bundled SRD manifest has missing or mismatched pack identity.')
  }
  for (const field of ['documents', 'license', 'transformationNotice']) {
    assertMatchingMetadata(manifest, provenance, field)
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    throw new Error('Bundled SRD manifest has no source-document metadata.')
  }

  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('Bundled SRD manifest has no file checksum map.')
  }
  const expectedDataPaths = Object.keys(manifest.files).sort()
  if (expectedDataPaths.length === 0)
    throw new Error('Bundled SRD manifest contains no data files.')
  for (const relativePath of expectedDataPaths) {
    if (!/^data\/(?:[^/]+\/)*[^/]+\.json$/.test(relativePath) || relativePath.includes('/../')) {
      throw new Error(`Bundled SRD manifest contains an invalid data path: ${relativePath}`)
    }
  }

  const actualDataPaths = packagedFiles
    .filter((file) => file.path.startsWith('data/'))
    .map((file) => file.path)
    .sort()
  if (JSON.stringify(actualDataPaths) !== JSON.stringify(expectedDataPaths)) {
    throw new Error('Bundled SRD data files do not exactly match the manifest checksum map.')
  }
  for (const relativePath of expectedDataPaths) {
    const expectedChecksum = manifest.files[relativePath]
    const contents = await readFile(resolve(resourceDirectory, relativePath))
    if (!/^[a-f0-9]{64}$/.test(expectedChecksum) || checksum(contents) !== expectedChecksum) {
      throw new Error(`Bundled SRD checksum mismatch: ${relativePath}`)
    }
  }

  if (!packagedPaths.has('THIRD_PARTY_NOTICES.md')) {
    throw new Error('Bundled SRD packaged third-party notices are missing.')
  }
  const notices = await readFile(resolve(resourceDirectory, 'THIRD_PARTY_NOTICES.md'), 'utf8')
  const normalizedNotices = notices.replaceAll(/\s+/g, ' ').trim()
  const requiredNotices = [
    `Pack version: ${manifest.packVersion}`,
    manifest.license?.url,
    manifest.transformationNotice,
    ...manifest.documents.flatMap((document) => [document.attribution, document.downloadUrl]),
  ]
  if (
    requiredNotices.some(
      (notice) =>
        typeof notice !== 'string' ||
        notice.length === 0 ||
        !normalizedNotices.includes(notice.replaceAll(/\s+/g, ' ').trim()),
    )
  ) {
    throw new Error('Bundled SRD packaged third-party notices are incomplete or stale.')
  }
  return packagedFiles
}

export function evaluateBundleBudgets(measurements, budgets = BUNDLE_BUDGETS) {
  return Object.entries(budgets).flatMap(([name, limit]) => {
    const actual = measurements[name]
    return actual > limit ? [{ name, actual, limit }] : []
  })
}

export async function checkBundleBudget(
  distDirectory = resolve('dist'),
  { requireBundledSrd = false, resourceDirectory = resolve('resources/srd/core') } = {},
) {
  const bundledSrdFiles = requireBundledSrd
    ? await validateBundledSrdPack(resourceDirectory)
    : (await collectFiles(resourceDirectory)).filter((file) => PACKAGED_SRD_FILE.test(file.path))
  const measurements = measureBundle(await collectFiles(distDirectory), bundledSrdFiles)
  const violations = evaluateBundleBudgets(measurements)
  if (violations.length > 0) {
    const details = violations
      .map(
        ({ name, actual, limit }) =>
          `- ${name}: ${formatBytes(actual)} (limit ${formatBytes(limit)})`,
      )
      .join('\n')
    throw new Error(
      `Production bundle exceeds its reviewed size budget:\n${details}\n` +
        'Optimize the regression or update the measured budget with an explicit review.',
    )
  }

  const summary = Object.entries(measurements)
    .map(([name, bytes]) => `${name}=${formatBytes(bytes)}`)
    .join(', ')
  console.log(`Bundle budgets passed: ${summary}`)
  return measurements
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const arguments_ = process.argv.slice(2)
  const unknown = arguments_.filter((argument) => argument !== '--require-srd')
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`)
  await checkBundleBudget(resolve('dist'), {
    requireBundledSrd: arguments_.includes('--require-srd'),
  })
}
