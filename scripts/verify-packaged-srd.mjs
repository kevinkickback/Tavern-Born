import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const normalizePath = (path) => path.replaceAll('\\', '/')
const checksum = (contents) => createHash('sha256').update(contents).digest('hex')
const ASAR_CLI = resolve('node_modules/@electron/asar/bin/asar.js')

async function collectFilePaths(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return collectFilePaths(root, path)
      return entry.isFile() ? [normalizePath(relative(root, path))] : []
    }),
  )
  return paths.flat()
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is missing or invalid JSON.`, { cause: error })
  }
}

/**
 * One-time verification for native Electron Builder output. This script is intentionally removed
 * after the Windows, macOS, and Linux checks have completed successfully.
 */
export async function verifyPackagedSrdPackage(
  resourcesDirectory,
  sourceRoot = resolve('resources/srd/core'),
) {
  const packagedRoot = resolve(resourcesDirectory, 'srd/core')
  const sourceManifestPath = resolve(sourceRoot, 'manifest.json')
  const packagedManifestPath = resolve(packagedRoot, 'manifest.json')
  const sourceManifest = await readJson(sourceManifestPath, 'Source SRD manifest')
  const packagedManifest = await readJson(packagedManifestPath, 'Packaged SRD manifest')

  if (!isDeepStrictEqual(packagedManifest, sourceManifest)) {
    throw new Error('Packaged SRD manifest does not exactly match the approved source manifest.')
  }
  if (
    !packagedManifest.files ||
    typeof packagedManifest.files !== 'object' ||
    Array.isArray(packagedManifest.files)
  ) {
    throw new Error('Packaged SRD manifest has no file checksum map.')
  }

  const expectedDataPaths = Object.keys(packagedManifest.files).sort()
  const expectedPaths = [...expectedDataPaths, 'THIRD_PARTY_NOTICES.md', 'manifest.json'].sort()
  const actualPaths = (await collectFilePaths(packagedRoot)).sort()
  if (!isDeepStrictEqual(actualPaths, expectedPaths)) {
    throw new Error('Packaged SRD files do not exactly match the approved distribution file set.')
  }

  for (const relativePath of expectedDataPaths) {
    const expectedChecksum = packagedManifest.files[relativePath]
    const contents = await readFile(resolve(packagedRoot, relativePath))
    if (!/^[a-f0-9]{64}$/.test(expectedChecksum) || checksum(contents) !== expectedChecksum) {
      throw new Error(`Packaged SRD checksum mismatch: ${relativePath}`)
    }
  }

  const sourceNotices = await readFile(resolve(sourceRoot, 'THIRD_PARTY_NOTICES.md'))
  const packagedNotices = await readFile(resolve(packagedRoot, 'THIRD_PARTY_NOTICES.md'))
  if (!sourceNotices.equals(packagedNotices)) {
    throw new Error('Packaged SRD third-party notices do not match the approved source notices.')
  }

  const appArchive = resolve(resourcesDirectory, 'app.asar')
  if (!(await pathExists(appArchive))) {
    throw new Error('Packaged Electron application archive is missing.')
  }
  const archivePaths = execFileSync(process.execPath, [ASAR_CLI, 'list', appArchive], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => normalizePath(path).replace(/^\/+/, ''))
  if (archivePaths.some((path) => path === 'data' || path.startsWith('data/'))) {
    throw new Error('Development-only game data was included in the packaged application archive.')
  }
  if (
    (await pathExists(resolve(resourcesDirectory, 'data'))) ||
    (await pathExists(resolve(resourcesDirectory, 'app.asar.unpacked/data')))
  ) {
    throw new Error('Development-only game data was included beside the packaged application.')
  }

  return {
    dataFileCount: expectedDataPaths.length,
    packId: packagedManifest.packId,
    packVersion: packagedManifest.packVersion,
  }
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const resourcesDirectory = process.argv[2] || process.env.PACKAGED_RESOURCES_DIR
  if (!resourcesDirectory) {
    throw new Error('Usage: node scripts/verify-packaged-srd.mjs <packaged-resources-directory>')
  }
  const result = await verifyPackagedSrdPackage(resourcesDirectory)
  console.log(
    `Packaged SRD verified: ${result.dataFileCount} data files, ${result.packId}@${result.packVersion}`,
  )
}
