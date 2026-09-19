import { readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

let notesFile
let publishedTagsFile
let previousVersion
let sourceRoot
const arguments_ = process.argv.slice(2)
for (let index = 0; index < arguments_.length; index += 1) {
  const argument = arguments_[index]
  const value = arguments_[index + 1]
  if (
    argument === '--notes-file' ||
    argument === '--published-tags-file' ||
    argument === '--previous-version' ||
    argument === '--source-root'
  ) {
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`)
    if (argument === '--notes-file') notesFile = value
    else if (argument === '--published-tags-file') publishedTagsFile = value
    else if (argument === '--previous-version') previousVersion = value
    else sourceRoot = value
    index += 1
  } else {
    throw new Error(`Unknown argument: ${argument}`)
  }
}

const root = sourceRoot
  ? pathToFileURL(`${resolve(sourceRoot)}${sep}`)
  : new URL('../', import.meta.url)
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

const packageJson = await readJson('package.json')
const packageLock = await readJson('package-lock.json')
const version = packageJson.version
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const compareVersions = (left, right) => {
  const leftParts = left.split('.').map(BigInt)
  const rightParts = right.split('.').map(BigInt)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }
  return 0
}

if (typeof version !== 'string' || !stableVersionPattern.test(version)) {
  throw new Error(
    'Releases require a stable X.Y.Z package version (no prerelease or build suffix).',
  )
}

const metadataVersions = new Map([
  ['package-lock.json', packageLock.version],
  ['package-lock.json root package', packageLock.packages?.['']?.version],
])
const mismatches = [...metadataVersions].filter(([, value]) => value !== version)
if (mismatches.length > 0) {
  const details = mismatches.map(([source, value]) => `${source}: ${value ?? 'missing'}`).join('\n')
  throw new Error(`Version metadata does not match package.json (${version}):\n${details}`)
}

if (previousVersion !== undefined) {
  if (!stableVersionPattern.test(previousVersion)) {
    throw new Error(`Previous package version is not stable X.Y.Z: ${previousVersion}`)
  }
  if (compareVersions(version, previousVersion) <= 0) {
    throw new Error(`Release version must increase (${previousVersion} -> ${version}).`)
  }
}

if (publishedTagsFile !== undefined) {
  const publishedVersions = (await readFile(new URL(publishedTagsFile, root), 'utf8'))
    .split(/\r?\n/)
    .map((tag) => tag.trim().replace(/^v/, ''))
    .filter((tag) => stableVersionPattern.test(tag))
  const latestPublished = publishedVersions.reduce(
    (latest, candidate) =>
      latest === undefined || compareVersions(candidate, latest) > 0 ? candidate : latest,
    undefined,
  )
  if (latestPublished !== undefined && compareVersions(version, latestPublished) <= 0) {
    throw new Error(
      `Release version ${version} must be greater than the latest published version ${latestPublished}.`,
    )
  }
}

const changelog = await readFile(new URL('docs/changelog.md', root), 'utf8')
const lines = changelog.split(/\r?\n/)
const heading = `<summary><strong>v${version}</strong></summary>`
const starts = lines.flatMap((line, index) => (line.trim() === heading ? [index] : []))
if (starts.length !== 1) {
  throw new Error(`Expected exactly one "${heading}" entry in docs/changelog.md.`)
}

const start = starts[0]
const end = lines.findIndex((line, index) => index > start && line.trim() === '</details>')
if (
  start === 0 ||
  lines[start - 1].trim() !== '<details>' ||
  end === -1 ||
  lines.slice(start + 1, end).some((line) => line.trim().startsWith('<details'))
) {
  throw new Error(`No complete changelog section found for v${version} in docs/changelog.md.`)
}

const notes = lines
  .slice(start + 1, end)
  .join('\n')
  .trim()
if (!notes) throw new Error(`Release notes for v${version} are empty.`)

if (notesFile !== undefined) await writeFile(notesFile, `${notes}\n`)

console.log(`Stable version metadata and release notes validated for v${version}.`)
