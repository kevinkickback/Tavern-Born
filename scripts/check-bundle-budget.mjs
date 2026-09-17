import { readdir, stat } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const KIB = 1024
const MIB = 1024 * KIB

export const BUNDLE_BUDGETS = Object.freeze({
  totalDistribution: 19 * MIB,
  staticAssets: 13 * MIB,
  rendererCode: 5.25 * MIB,
  initialRendererScript: 420 * KIB,
  initialStylesheet: 185 * KIB,
  largestLazyScript: 620 * KIB,
  pdfWorker: 2.2 * MIB,
})

const normalizePath = (path) => path.replaceAll('\\', '/')
const formatBytes = (bytes) => `${(bytes / KIB).toFixed(1)} KiB`

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

export function measureBundle(files) {
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
    totalDistribution: files.reduce((sum, file) => sum + file.size, 0),
    staticAssets: staticAssetFiles.reduce((sum, file) => sum + file.size, 0),
    rendererCode: rendererCodeFiles.reduce((sum, file) => sum + file.size, 0),
    initialRendererScript: initialScript.size,
    initialStylesheet: initialStylesheet.size,
    largestLazyScript: Math.max(0, ...lazyScripts.map((file) => file.size)),
    pdfWorker: pdfWorker.size,
  }
}

export function evaluateBundleBudgets(measurements, budgets = BUNDLE_BUDGETS) {
  return Object.entries(budgets).flatMap(([name, limit]) => {
    const actual = measurements[name]
    return actual > limit ? [{ name, actual, limit }] : []
  })
}

export async function checkBundleBudget(distDirectory = resolve('dist')) {
  const measurements = measureBundle(await collectFiles(distDirectory))
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
if (isMain) await checkBundleBudget()
