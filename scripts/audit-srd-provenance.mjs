#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { auditSrdSnapshot, buildProvenanceExceptionCsv } from './srd/provenanceAudit.mjs'

function parseArguments(argv) {
  const options = { requireClean: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--require-clean') {
      options.requireClean = true
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
    if (argument === '--review-root') options.reviewRoot = value
    else if (argument === '--output-root') options.outputRoot = value
    else if (argument === '--srd-5.1-pdf') options.srd51Pdf = value
    else if (argument === '--srd-5.2.1-pdf') options.srd521Pdf = value
    else if (argument === '--approvals') options.approvals = value
    else throw new Error(`Unknown argument ${argument}`)
    index += 1
  }
  return options
}

async function readApprovals(path) {
  if (!path) return { schemaVersion: 1, exceptions: [] }
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.srd51Pdf) throw new Error('--srd-5.1-pdf is required')
  if (!args.srd521Pdf) throw new Error('--srd-5.2.1-pdf is required')

  const projectRoot = resolve(import.meta.dirname, '..')
  const reviewRoot = resolve(projectRoot, args.reviewRoot ?? '.tmp/srd-review')
  const outputRoot = resolve(projectRoot, args.outputRoot ?? '.tmp/srd-audit')
  const approvalsPath = args.approvals ? resolve(projectRoot, args.approvals) : undefined
  const report = await auditSrdSnapshot({
    reviewRoot,
    documentPaths: new Map([
      ['5.1', resolve(projectRoot, args.srd51Pdf)],
      ['5.2.1', resolve(projectRoot, args.srd521Pdf)],
    ]),
    approvals: await readApprovals(approvalsPath),
  })

  await mkdir(outputRoot, { recursive: true })
  await writeFile(
    resolve(outputRoot, 'provenance-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    resolve(outputRoot, 'provenance-exceptions.csv'),
    buildProvenanceExceptionCsv(report),
    'utf8',
  )

  const { summary } = report
  console.log(
    `Audited ${summary.totalRecords} records: ${summary.matchedRecords} matched, ${summary.approvedWithExceptions} approved with exceptions, ${summary.recordsNeedingReview} need review (${summary.evidenceNeedingReview} evidence exceptions).`,
  )
  if (summary.staleApprovals > 0) {
    console.error(
      `${summary.staleApprovals} stale provenance approval(s) must be removed or updated.`,
    )
  }
  if (args.requireClean && (summary.recordsNeedingReview > 0 || summary.staleApprovals > 0)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
