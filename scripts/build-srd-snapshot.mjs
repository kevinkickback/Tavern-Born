#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { assertSnapshotOutputLocation } from './srd/outputPolicy.mjs'
import { findUnexpectedSnapshotFiles, verifySnapshotFiles } from './srd/outputVerification.mjs'
import { buildSrdReviewInventory } from './srd/reviewReport.mjs'
import { buildSrdSnapshot, describeSnapshot } from './srd/snapshot.mjs'

function parseArguments(argv) {
  const options = { review: false, verify: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--verify') {
      options.verify = true
      continue
    }
    if (argument === '--review') {
      options.review = true
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
  if (args.review && args.verify) throw new Error('--review and --verify cannot be combined')

  const projectRoot = resolve(import.meta.dirname, '..')
  const managedDataRoot = resolve(projectRoot, 'data')
  const managedResourceRoot = resolve(projectRoot, 'resources/srd/core')
  const outputRoot = resolve(
    projectRoot,
    args.outputRoot ?? (args.review ? '.tmp/srd-review' : 'resources/srd/core'),
  )
  const sourceRoot = resolve(projectRoot, args.sourceRoot)
  const provenance = await readJson(resolve(projectRoot, 'resources/srd/core/provenance.json'))
  const allowlist = await readJson(
    resolve(projectRoot, 'resources/srd/core/dependency-allowlist.json'),
  )
  assertSnapshotOutputLocation({
    sourceRoot,
    outputRoot,
    managedDataRoot,
    managedResourceRoot,
    distributionStatus: provenance.distributionStatus,
  })
  const snapshot = await buildSrdSnapshot({
    sourceRoot,
    provenance,
    allowlist,
    upstreamRevision: args.upstreamRevision,
  })
  const outputFiles = new Map(snapshot.files)
  if (args.review) {
    outputFiles.set('review-inventory.csv', buildSrdReviewInventory(snapshot.manifest))
  }

  await rejectUnexpectedDataFiles(outputRoot, outputFiles)

  if (args.verify) await verifySnapshotFiles(outputRoot, outputFiles)
  else await writeFiles(outputRoot, outputFiles)

  const summary = describeSnapshot(snapshot)
  console.log(
    `${args.verify ? 'Verified' : args.review ? 'Generated review for' : 'Generated'} SRD ${summary.packVersion}: ${summary.rootCount} roots, ${summary.dependencyCount} dependencies, ${summary.fileCount} files.`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
