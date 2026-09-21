import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import type { JsonResourceReader } from '@/lib/5etools/resourceReader'
import { computeGameDataFingerprint } from '@/lib/storage/dataCache'

const RESOURCE_ROOT = resolve(process.cwd(), 'resources', 'srd', 'core')
const DATA_ROOT = resolve(RESOURCE_ROOT, 'data')

async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8'))
}

describe('committed bundled SRD corpus', () => {
  test('matches its approved provenance and checksum manifest', async () => {
    const manifest = await readJson(resolve(RESOURCE_ROOT, 'manifest.json'))
    const provenance = await readJson(resolve(RESOURCE_ROOT, 'provenance.json'))

    expect(manifest).toMatchObject({
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      distributionStatus: 'approved-for-distribution',
      upstreamRevision: 'e5d052071b635f58cc8006e9727053eaf78ea8f9',
    })
    expect(provenance.review).toMatchObject({
      totalRecords: 3102,
      exactMatches: 2672,
      approvedRepresentations: 430,
      unresolvedRecords: 0,
      staleApprovals: 0,
    })
    expect(manifest.coverage.records).toHaveLength(3102)
    expect(
      manifest.coverage.records.filter(
        (record: { provenanceType: string }) => record.provenanceType === 'root-marker',
      ),
    ).toHaveLength(3021)
    expect(manifest.coverage.dependencies).toHaveLength(81)
    expect(manifest.coverage.structuredCorrections).toMatchObject({
      officialSrdName2014: 31,
      officialSrdName2024: 32,
    })

    for (const [relativePath, expectedHash] of Object.entries(manifest.files as object)) {
      const contents = await readFile(resolve(RESOURCE_ROOT, ...relativePath.split('/')))
      expect(createHash('sha256').update(contents).digest('hex'), relativePath).toBe(expectedHash)
    }
  })

  test('loads through the production parser without capability failures', async () => {
    const manifest = await readJson(resolve(RESOURCE_ROOT, 'manifest.json'))
    const reader: JsonResourceReader = {
      type: 'bundled',
      readJson(relativePath) {
        return readJson(resolve(DATA_ROOT, ...relativePath.split('/')))
      },
    }
    const failures: Array<{ resource: string; required: boolean }> = []
    const gameData = await new FiveEToolsDataLoader(
      {
        type: 'bundled',
        path: 'srd/core',
        packId: manifest.packId,
        packVersion: manifest.packVersion,
        isValid: true,
      },
      reader,
    ).loadAllData({
      onResourceFailure: (resource, failure) => failures.push({ resource, ...failure }),
    })

    expect(failures).toEqual([])
    expect(createCorpusCapabilityReport(gameData).issues).toEqual([])
    expect(computeGameDataFingerprint(gameData)).toMatch(/^[a-f0-9]{8}$/)
    expect(gameData.classes.some((entry) => entry.source === 'PHB')).toBe(true)
    expect(gameData.classes.some((entry) => entry.source === 'XPHB')).toBe(true)
    expect(gameData.spells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Acid Arrow', source: 'PHB' }),
        expect.objectContaining({ name: 'Acid Arrow', source: 'XPHB' }),
      ]),
    )
    expect(gameData.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Apparatus of the Crab', source: 'DMG' }),
        expect.objectContaining({ name: 'Dragon Orb', source: 'XDMG' }),
        expect.objectContaining({ name: 'Mysterious Deck', source: 'XDMG' }),
      ]),
    )
  }, 30_000)
})
