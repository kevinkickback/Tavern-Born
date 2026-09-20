#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { findUnexpectedSnapshotFiles, verifySnapshotFiles } from './srd/outputVerification.mjs'
import { buildSrdSnapshot, describeSnapshot } from './srd/snapshot.mjs'

function parseArguments(argv) {
  const options = { verify: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--verify') {
      options.verify = true
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
    if (argument === '--source-root') options.sourceRoot = value
    else if (argument === '--output-root') options.outputRoot = value
    else if (argument === '--upstream-revision') options.upstreamRevision = value
    else throw new Error(`Unknown argument ${argument}`)
    index += 1
  }
  return options
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function rejectUnexpectedDataFiles(outputRoot, expectedFiles) {
  const unexpected = await findUnexpectedSnapshotFiles(outputRoot, expectedFiles)
  if (unexpected.length > 0) {
    throw new Error(
      `Bundled SRD output contains unexpected files; remove them before continuing:\n- ${unexpected.join('\n- ')}`,
    )
  }
}

async function writeFiles(outputRoot, files) {
  for (const [relativePath, contents] of files) {
    const path = resolve(outputRoot, ...relativePath.split('/'))
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents, 'utf8')
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.sourceRoot) throw new Error('--source-root is required')
  if (!args.upstreamRevision) throw new Error('--upstream-revision is required')

  const projectRoot = resolve(import.meta.dirname, '..')
  const outputRoot = resolve(projectRoot, args.outputRoot ?? 'resources/srd/core')
  const sourceRoot = resolve(projectRoot, args.sourceRoot)
  const provenance = await readJson(resolve(projectRoot, 'resources/srd/core/provenance.json'))
  const allowlist = await readJson(
    resolve(projectRoot, 'resources/srd/core/dependency-allowlist.json'),
  )
  const snapshot = await buildSrdSnapshot({
    sourceRoot,
    provenance,
    allowlist,
    upstreamRevision: args.upstreamRevision,
  })

  await rejectUnexpectedDataFiles(outputRoot, snapshot.files)

  if (args.verify) await verifySnapshotFiles(outputRoot, snapshot.files)
  else await writeFiles(outputRoot, snapshot.files)

  const summary = describeSnapshot(snapshot)
  console.log(
    `${args.verify ? 'Verified' : 'Generated'} SRD ${summary.packVersion}: ${summary.rootCount} roots, ${summary.dependencyCount} dependencies, ${summary.fileCount} files.`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
