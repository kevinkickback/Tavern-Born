import { existsSync } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize } from 'node:path'
import { isPathWithinRoot } from './security'

const MAX_BUNDLED_JSON_BYTES = 50 * 1024 * 1024
const APPROVED_DISTRIBUTION_STATUS = 'approved-for-distribution'

export interface BundledSrdManifestSummary {
  schemaVersion: number
  packId: string
  packVersion: string
  distributionStatus: string
  documents: Array<{
    version: string
    landingPage: string
    downloadUrl: string
    attribution: string
  }>
  license: {
    name: string
    identifier: string
    url: string
  }
  transformationNotice: string
}

export function resolveBundledPackRoot({
  isPackaged,
  resourcesPath,
  repositoryRoot,
}: {
  isPackaged: boolean
  resourcesPath: string
  repositoryRoot: string
}): string {
  if (isPackaged) return join(resourcesPath, 'srd/core')

  const managedRoot = join(repositoryRoot, 'resources/srd/core')
  return existsSync(join(managedRoot, 'manifest.json'))
    ? managedRoot
    : join(repositoryRoot, '.tmp/srd-review')
}

export function assertBundledManifestAllowed(
  manifest: BundledSrdManifestSummary,
  isPackaged: boolean,
): void {
  if (isPackaged && manifest.distributionStatus !== APPROVED_DISTRIBUTION_STATUS) {
    throw new Error('Bundled SRD manifest is not approved for distribution')
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Bundled SRD manifest has invalid ${label}`)
  }
  return value
}

function requireHttpsUrl(value: unknown, label: string): string {
  const url = requireNonEmptyString(value, label)
  try {
    if (new URL(url).protocol !== 'https:') throw new Error('not HTTPS')
  } catch {
    throw new Error(`Bundled SRD manifest has invalid ${label}`)
  }
  return url
}

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

export async function readBundledManifestFromRoot(
  rootPath: string,
): Promise<BundledSrdManifestSummary> {
  const value = await readBundledJsonFromRoot(rootPath, 'manifest.json')
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Bundled SRD manifest must be a JSON object')
  }
  const manifest = value as Record<string, unknown>
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.packId !== 'string' ||
    manifest.packId.length === 0 ||
    typeof manifest.packVersion !== 'string' ||
    manifest.packVersion.length === 0 ||
    typeof manifest.distributionStatus !== 'string' ||
    manifest.distributionStatus.length === 0
  ) {
    throw new Error('Bundled SRD manifest has incomplete pack identity')
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    throw new Error('Bundled SRD manifest has incomplete provenance metadata')
  }
  const documents = manifest.documents.map((document, index) => {
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
      throw new Error(`Bundled SRD manifest has invalid documents[${index}]`)
    }
    const record = document as Record<string, unknown>
    return {
      version: requireNonEmptyString(record.version, `documents[${index}].version`),
      landingPage: requireHttpsUrl(record.landingPage, `documents[${index}].landingPage`),
      downloadUrl: requireHttpsUrl(record.downloadUrl, `documents[${index}].downloadUrl`),
      attribution: requireNonEmptyString(record.attribution, `documents[${index}].attribution`),
    }
  })
  if (
    !manifest.license ||
    typeof manifest.license !== 'object' ||
    Array.isArray(manifest.license)
  ) {
    throw new Error('Bundled SRD manifest has incomplete license metadata')
  }
  const license = manifest.license as Record<string, unknown>
  return {
    schemaVersion: manifest.schemaVersion,
    packId: manifest.packId,
    packVersion: manifest.packVersion,
    distributionStatus: manifest.distributionStatus,
    documents,
    license: {
      name: requireNonEmptyString(license.name, 'license.name'),
      identifier: requireNonEmptyString(license.identifier, 'license.identifier'),
      url: requireHttpsUrl(license.url, 'license.url'),
    },
    transformationNotice: requireNonEmptyString(
      manifest.transformationNotice,
      'transformationNotice',
    ),
  }
}
