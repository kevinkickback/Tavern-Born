import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import type { JsonResourceReader } from '@/lib/5etools/resourceReader'
import { buildSrdSnapshot, isSrdRoot } from '../../scripts/srd/snapshot.mjs'

const PROJECT_ROOT = process.cwd()
const DATA_ROOT = resolve(PROJECT_ROOT, 'data')
const HAS_CONFIGURED_CORPUS = existsSync(join(DATA_ROOT, 'class', 'index.json'))
const STRIPPED_METADATA_KEYS = new Set([
  'additionalEntries',
  'additionalSources',
  'basicRules',
  'basicRules2024',
  'hasFluff',
  'hasFluffImages',
  'otherSources',
  'page',
  'reprintedAs',
  'soundClip',
])

function assertSanitizedPayload(value: unknown, allowedSources: Set<string>, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertSanitizedPayload(entry, allowedSources, `${path}[${index}]`)
    })
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, entry] of Object.entries(value)) {
    expect(STRIPPED_METADATA_KEYS.has(key), `${path}.${key} retained stripped metadata`).toBe(false)
    expect(['image', 'images', 'tokenUrl'].includes(key), `${path}.${key} retained an asset`).toBe(
      false,
    )
    if (key.toLowerCase().endsWith('source') && typeof entry === 'string') {
      expect(allowedSources.has(entry.toUpperCase()), `${path}.${key} used ${entry}`).toBe(true)
    }
    assertSanitizedPayload(entry, allowedSources, `${path}.${key}`)
  }
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8'))
}

describe.runIf(HAS_CONFIGURED_CORPUS)('bundled SRD configured-corpus contract', () => {
  test('closes audited references and emits only marked roots', async () => {
    const provenance = await readJson(
      resolve(PROJECT_ROOT, 'resources', 'srd', 'core', 'provenance.json'),
    )
    const allowlist = await readJson(
      resolve(PROJECT_ROOT, 'resources', 'srd', 'core', 'dependency-allowlist.json'),
    )
    const options = {
      sourceRoot: DATA_ROOT,
      provenance,
      allowlist,
      upstreamRevision: 'configured-corpus-contract',
    }

    const first = await buildSrdSnapshot(options)
    const second = await buildSrdSnapshot(options)

    expect([...first.files.entries()]).toEqual([...second.files.entries()])
    expect(first.manifest.coverage.dependencies.length).toBeGreaterThan(0)
    expect(first.manifest.coverage.referenceExclusions.length).toBeGreaterThan(0)
    expect(first.manifest.coverage.strippedMetadata.page).toBeGreaterThan(0)
    expect(first.manifest.coverage.strippedMetadata.additionalEntries).toBeGreaterThan(0)
    const supportPayload = JSON.parse(first.files.get('data/items-base.json') ?? '{}') as {
      itemProperty?: unknown[]
      itemType?: unknown[]
    }
    expect(first.manifest.coverage.dependencies).toHaveLength(
      (supportPayload.itemProperty?.length ?? 0) + (supportPayload.itemType?.length ?? 0),
    )
    const documentVersions = new Set(
      (provenance.documents as Array<{ version: string }>).map((document) => document.version),
    )
    expect(
      first.manifest.coverage.dependencies.every((dependency) =>
        documentVersions.has(dependency.srdVersion),
      ),
    ).toBe(true)
    expect(
      Object.values(first.manifest.coverage.references).reduce(
        (total, reference) => total + reference.resolved,
        0,
      ),
    ).toBeGreaterThan(0)

    const emittedRecordCount = [...first.files.entries()].reduce(
      (total, [relativePath, contents]) => {
        if (!relativePath.startsWith('data/')) return total
        const payload = JSON.parse(contents) as Record<string, unknown>
        return (
          total +
          Object.values(payload).reduce<number>(
            (fileTotal, value) => fileTotal + (Array.isArray(value) ? value.length : 0),
            0,
          )
        )
      },
      0,
    )
    expect(first.manifest.coverage.records).toHaveLength(emittedRecordCount)
    expect(
      first.manifest.coverage.records.filter(
        (record) => record.provenanceType === 'approved-dependency',
      ),
    ).toHaveLength(first.manifest.coverage.dependencies.length)
    expect(
      first.manifest.coverage.records.every(
        (record) =>
          /^[a-f0-9]{64}$/.test(record.recordSha256) && documentVersions.has(record.srdVersion),
      ),
    ).toBe(true)

    const allowedSources = new Set(
      (allowlist.allowedSources as string[]).map((source) => source.toUpperCase()),
    )

    for (const [relativePath, contents] of first.files) {
      if (!relativePath.startsWith('data/')) continue
      const payload = JSON.parse(contents) as Record<string, unknown>
      assertSanitizedPayload(payload, allowedSources)
      if (relativePath === 'data/items-base.json') continue
      for (const records of Object.values(payload)) {
        if (!Array.isArray(records)) continue
        expect(records.every(isSrdRoot), `${relativePath} contains an unmarked root`).toBe(true)
      }
    }

    const reader: JsonResourceReader = {
      type: 'bundled',
      readJson(relativePath) {
        const contents = first.files.get(`data/${relativePath}`)
        if (!contents) throw new Error(`Missing snapshot resource data/${relativePath}`)
        return Promise.resolve(JSON.parse(contents))
      },
    }
    const failures: Array<{ resource: string; required: boolean }> = []
    const gameData = await new FiveEToolsDataLoader(
      {
        type: 'bundled',
        path: 'srd/core',
        packId: first.manifest.packId,
        packVersion: first.manifest.packVersion,
        isValid: true,
      },
      reader,
    ).loadAllData({
      onResourceFailure: (resource, failure) => failures.push({ resource, ...failure }),
    })

    expect(failures).toEqual([])
    expect(gameData.classes.some((entry) => entry.source === 'PHB')).toBe(true)
    expect(gameData.classes.some((entry) => entry.source === 'XPHB')).toBe(true)
    expect(gameData.spells.some((entry) => entry.source === 'PHB')).toBe(true)
    expect(gameData.spells.some((entry) => entry.source === 'XPHB')).toBe(true)
    expect(createCorpusCapabilityReport(gameData).issues).toEqual([])
  })
})
