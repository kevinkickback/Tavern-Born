import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { JsonResourceReader } from '@/lib/5etools/resourceReader'
import { resolveClassEquipmentBlocks } from '@/lib/5etools/startingEquipment'
import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassEquipmentChoiceCommand,
  applyClassSelectionCommand,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { validateStartingEquipment } from '@/lib/readiness/startingEquipmentReadiness'
import { computeGameDataFingerprint } from '@/lib/storage/dataCache'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const RESOURCE_ROOT = resolve(process.cwd(), 'resources', 'srd')
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
      packVersion: '1.0.1',
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
    expect(provenance.packVersion).toBe(manifest.packVersion)
    expect(manifest.coverage.records).toHaveLength(3103)
    expect(
      manifest.coverage.records.filter(
        (record: { provenanceType: string }) => record.provenanceType === 'root-marker',
      ),
    ).toHaveLength(3021)
    expect(manifest.coverage.dependencies).toHaveLength(82)
    expect(manifest.coverage.structuredCorrections).toMatchObject({
      officialSrdName2014: 31,
      officialSrdName2024: 32,
    })

    for (const [relativePath, expectedHash] of Object.entries(manifest.files as object)) {
      const contents = await readFile(resolve(RESOURCE_ROOT, ...relativePath.split('/')))
      expect(createHash('sha256').update(contents).digest('hex'), relativePath).toBe(expectedHash)
    }
  })

  test('loads through the production parser and reports exact known required setup gaps', async () => {
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
    const rawConditions = await readJson(resolve(DATA_ROOT, 'conditionsdiseases.json'))
    expect(gameData.conditions).toHaveLength(
      rawConditions.condition.length + rawConditions.disease.length + rawConditions.status.length,
    )
    expect(
      gameData.conditions.filter(
        (row) => (row as { _sourceType: string })._sourceType === 'status',
      ),
    ).toEqual(rawConditions.status.map((row: object) => ({ ...row, _sourceType: 'status' })))
    const rawTraps = await readJson(resolve(DATA_ROOT, 'trapshazards.json'))
    expect(gameData.trapHazards).toHaveLength(rawTraps.trap.length + rawTraps.hazard.length)
    expect(createCorpusCapabilityReport(gameData).issues).toEqual([])
    const druid = gameData.classes.find((row) => row.name === 'Druid' && row.source === 'PHB')!
    const lookups = buildGameDataLookups(gameData)
    const rawItems = [...gameData.items, ...gameData.itemsBase]
    let character = makeCharacterFixture({
      classProgression: [],
      initialClass: undefined,
      allowedSources: ['PHB'],
      background: '',
      backgroundSource: undefined,
    })
    const policy = (items = rawItems) =>
      createStartingEquipmentPolicy(
        character,
        { ...druid, kind: 'class' },
        druid.startingEquipment,
        items,
      )
    const apply = (result: CharacterCommandResult) => {
      character = characterPersistenceSchema.parse({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    }
    const select = (items = rawItems) =>
      apply(
        applyClassSelectionCommand(
          character,
          character.provenance,
          druid,
          undefined,
          lookups.itemLookup,
          {
            startingEquipmentPolicy: policy(items),
          },
        ),
      )
    const readiness = (items = rawItems) =>
      validateStartingEquipment(
        character,
        createCharacterCalculationContext(character, lookups, {
          ...lookups,
          startingEquipmentItems: items,
        }),
      )

    select()
    const slot = resolveClassEquipmentBlocks(
      druid.startingEquipment,
      lookups.itemLookup,
      {},
      policy(),
    )[2].options._.genericChoices?.[0]
    expect(slot?.candidates).toEqual(
      ['Sprig of Mistletoe', 'Totem', 'Wooden Staff', 'Yew Wand'].map((name) => ({
        name,
        source: 'PHB',
      })),
    )
    apply(
      applyClassEquipmentChoiceCommand(
        character,
        character.provenance,
        druid,
        2,
        '_',
        lookups.itemLookup,
        {
          [slot!.key]: [{ name: 'Wooden Staff', source: 'PHB' }],
        },
        policy(),
      ),
    )
    const staff = character.equipment.find((item) => item.name === 'Wooden Staff')
    expect(staff).toMatchObject({ source: 'PHB', quantity: 1, dmg1: '1d6', dmg2: '1d8' })
    expect(readiness()).toEqual([])

    const withdrawn = rawItems.filter((row) => row.name !== 'Druidic Focus' || row.source !== 'PHB')
    select(withdrawn)
    expect(character.equipment.find((item) => item.id === staff!.id)).toEqual(staff)
    expect(readiness(withdrawn)).toContainEqual(
      expect.objectContaining({ id: 'starting-equipment:class', severity: 'blocking' }),
    )
    select()
    expect(character.equipment.filter((item) => item.name === 'Wooden Staff')).toEqual([staff])
    expect(readiness()).toEqual([])

    const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(gameData))
    const ranger = gameData.classes.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
    expect(
      getClassChoiceCandidates(ranger, undefined, catalogs)
        .filter((c) => c.label === 'Favored Enemy')
        .map((c) => c.level),
    ).toEqual([1, 6, 14])
    const terrain = getClassChoiceCandidates(ranger, undefined, catalogs).filter(
      (row) => row.label === 'Natural Explorer',
    )
    expect(terrain.map((row) => row.level)).toEqual([1, 6, 10])
    for (const choice of terrain) {
      expect(choice.minimumSelections).toBe(1)
      expect(choice.maximumSelections).toBe(1)
      expect(
        resolveClassChoiceOptions(choice, catalogs)
          .filter((row) => row.availability === 'eligible')
          .map((row) => row.reference.name),
      ).toEqual([
        'Arctic',
        'Coast',
        'Desert',
        'Forest',
        'Grassland',
        'Mountain',
        'Swamp',
        'Underdark',
      ])
    }
    expect(computeGameDataFingerprint(gameData)).toMatch(/^[a-f0-9]{64}$/)
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
