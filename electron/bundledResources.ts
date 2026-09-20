import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize } from 'node:path'
import { isPathWithinRoot } from './security'

const MAX_BUNDLED_JSON_BYTES = 50 * 1024 * 1024

export function validateBundledResourcePath(relativePath: unknown): string[] {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('Bundled resource path must be a non-empty string')
  }
  if (isAbsolute(relativePath) || relativePath.includes('\\')) {
    throw new Error('Bundled resource path must be relative and use forward slashes')
  }
  const segments = relativePath.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Bundled resource path contains an invalid segment')
  }
  if (extname(relativePath).toLowerCase() !== '.json') {
    throw new Error('Only bundled JSON files may be read')
  }
  return segments
}

export async function readBundledJsonFromRoot(
  rootPath: string,
  relativePath: unknown,
): Promise<unknown> {
  const segments = validateBundledResourcePath(relativePath)
  const canonicalRoot = normalize(await realpath(rootPath))
  const canonicalTarget = normalize(await realpath(join(canonicalRoot, ...segments)))
  if (!isPathWithinRoot(canonicalRoot, canonicalTarget)) {
    throw new Error('Access denied: path is outside the bundled data directory.')
  }

  const fileStats = await stat(canonicalTarget)
  if (!fileStats.isFile()) throw new Error('Bundled resource does not reference a file')
  if (fileStats.size > MAX_BUNDLED_JSON_BYTES) {
    throw new Error('Bundled JSON file exceeds the 50 MB safety limit')
  }
  return JSON.parse(await readFile(canonicalTarget, 'utf-8'))
}
