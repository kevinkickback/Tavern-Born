import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildSrdSnapshot, isSrdRoot } from '../../scripts/srd/snapshot.mjs'

const PROJECT_ROOT = process.cwd()
const DATA_ROOT = resolve(PROJECT_ROOT, 'data')
const HAS_CONFIGURED_CORPUS = existsSync(join(DATA_ROOT, 'class', 'index.json'))

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

    for (const [relativePath, contents] of first.files) {
      if (!relativePath.startsWith('data/') || relativePath === 'data/items-base.json') continue
      const payload = JSON.parse(contents) as Record<string, unknown>
      for (const records of Object.values(payload)) {
        if (!Array.isArray(records)) continue
        expect(records.every(isSrdRoot), `${relativePath} contains an unmarked root`).toBe(true)
      }
    }
  })
})
