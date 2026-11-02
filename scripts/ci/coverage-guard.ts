import { readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Reporter, Vitest } from 'vitest/node'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function location(value: unknown): boolean {
  if (!record(value) || !record(value.start) || !record(value.end)) return false
  const start = value.start
  const end = value.end
  // Native V8 end-of-line columns serialize to null in a blob report.
  return (
    [start.line, end.line].every((line) => Number.isInteger(line) && Number(line) >= 0) &&
    Number.isInteger(start.column) &&
    Number(start.column) >= 0 &&
    (end.column === null || (Number.isInteger(end.column) && Number(end.column) >= 0))
  )
}

const hits = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0

function branchLocation(value: unknown): boolean {
  // An implicit else branch has no source range in native Istanbul/V8 maps.
  return (
    location(value) ||
    (record(value) &&
      record(value.start) &&
      record(value.end) &&
      Object.keys(value.start).length === 0 &&
      Object.keys(value.end).length === 0)
  )
}

export function validateCoverageMap(value: unknown, expectedFiles: string[]): void {
  if (!record(value) || Object.keys(value).length === 0)
    throw new Error('Coverage payload is missing')
  const normalize = (file: string) => resolve(file).replace(/\\/g, '/')
  const actual = Object.keys(value).map(normalize).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expectedFiles.map(normalize).sort())) {
    throw new Error('Coverage source inventory is incomplete or unexpected')
  }
  for (const [file, coverage] of Object.entries(value)) {
    if (
      !record(coverage) ||
      typeof coverage.path !== 'string' ||
      normalize(coverage.path) !== normalize(file)
    ) {
      throw new Error('Invalid coverage source identity')
    }
    for (const [countsKey, metadataKey] of [
      ['s', 'statementMap'],
      ['f', 'fnMap'],
      ['b', 'branchMap'],
    ]) {
      const counts = coverage[countsKey]
      const metadata = coverage[metadataKey]
      if (
        !record(counts) ||
        !record(metadata) ||
        JSON.stringify(Object.keys(counts).sort()) !== JSON.stringify(Object.keys(metadata).sort())
      ) {
        throw new Error('Coverage counters and source locations disagree')
      }
      for (const [id, count] of Object.entries(counts)) {
        const item = metadata[id]
        if (countsKey === 's' && (!hits(count) || !location(item)))
          throw new Error('Invalid statement coverage')
        if (
          countsKey === 'f' &&
          (!hits(count) || !record(item) || !location(item.loc) || !location(item.decl))
        )
          throw new Error('Invalid function coverage')
        if (
          countsKey === 'b' &&
          (!Array.isArray(count) ||
            !count.every(hits) ||
            !record(item) ||
            !location(item.loc) ||
            !Array.isArray(item.locations) ||
            item.locations.length !== count.length ||
            !item.locations.every(branchLocation))
        )
          throw new Error(`Invalid branch coverage: ${file}:${id}`)
      }
    }
  }
}

export function validateMembership(actual: string[], expected: string[]): void {
  if (
    actual.length === 0 ||
    new Set(actual).size !== actual.length ||
    JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error('Coverage parts have duplicate, missing or unexpected test files')
  }
}

export function verifyReportFiles(directory: string, parts: number, root = process.cwd()): void {
  if (!Number.isSafeInteger(parts) || parts < 1)
    throw new Error('Expected coverage part count is required')
  const path = relative(realpathSync(root), realpathSync(directory))
  if (isAbsolute(path) || path === '..' || path.startsWith('../') || path.startsWith('..\\'))
    throw new Error('Coverage reports must remain inside the checkout')
  const entries = readdirSync(directory, { withFileTypes: true })
  const names = Array.from({ length: parts }, (_, i) => `blob-${i + 1}.json`).sort()
  if (
    entries.some((entry) => !entry.isFile()) ||
    JSON.stringify(entries.map((entry) => entry.name).sort()) !== JSON.stringify(names)
  )
    throw new Error('Expected exactly one current blob file per coverage part')
}

export default class CoverageGuard implements Reporter {
  async onInit(ctx: Vitest): Promise<void> {
    if (
      !ctx.config.mergeReports ||
      ctx.config.coverage.provider !== 'v8' ||
      !ctx.config.coverage.enabled
    ) {
      throw new Error('Coverage guard requires native V8 report merging')
    }
    const floors = ctx.config.coverage.thresholds
    if (
      !floors ||
      !['statements', 'branches', 'functions', 'lines'].every(
        (key) => Number(floors[key as keyof typeof floors]) > 0,
      )
    ) {
      throw new Error('Combined coverage thresholds are required')
    }
    const parts = Number(process.env.COVERAGE_PARTS)
    const directory = resolve(ctx.config.root, ctx.config.mergeReports)
    verifyReportFiles(directory, parts, ctx.config.root)
    const blobs = ctx.state.blobs
    if (!blobs || blobs.coverages.length !== parts || blobs.errors.length !== 0)
      throw new Error('Missing or failed coverage parts')
    const identity = (project: string, file: string) => {
      const path = relative(ctx.config.root, file).replace(/\\/g, '/')
      if (isAbsolute(path) || path.startsWith('../'))
        throw new Error('Test file is outside the checkout')
      return JSON.stringify([project, path])
    }
    const specifications = await ctx.globTestSpecifications()
    validateMembership(
      blobs.files.map((file) => identity(file.projectName ?? '', file.filepath)),
      specifications.map((spec) => identity(spec.project.name, spec.moduleId)),
    )
    const { BaseCoverageProvider } = await import('vitest/node')
    const provider = await ctx.createCoverageProvider()
    if (
      !(provider instanceof BaseCoverageProvider) ||
      provider.version !== ctx.version ||
      typeof provider.getUntestedFiles !== 'function'
    )
      throw new Error('Unsupported coverage provider/version')
    const sourceFiles = await provider.getUntestedFiles([])
    for (const coverage of blobs.coverages) validateCoverageMap(coverage, sourceFiles)
    console.log(
      `Verified ${parts} coverage parts, ${specifications.length} test files and ${sourceFiles.length} sources`,
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Coverage report directory is required')
  verifyReportFiles(resolve(process.argv[2]), Number(process.env.COVERAGE_PARTS))
  console.log('Coverage artifact filenames and file boundaries verified')
}
