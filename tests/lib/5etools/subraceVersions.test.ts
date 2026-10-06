import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { getRaceAbilityData } from '@/lib/calculations/abilityScores'
import { mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import type { Race5e } from '@/types/5etools'

const parent = {
  name: 'Test Race',
  source: 'PHB',
  speed: 30,
  ability: [{ dex: 2 }],
  darkvision: 60,
  entries: [{ name: 'Base Trait', entries: ['Parent rule'] }],
  skillProficiencies: [{ perception: true }],
  languageProficiencies: [{ common: true }],
  traitTags: ['Parent tag'],
}
const parse = (data: unknown) => parseRaces(data) as Race5e[]

function load(data: { race: unknown[]; subrace?: unknown[] }) {
  return new FiveEToolsDataLoader(
    { type: 'local', path: 'test', isValid: true, availableResources: ['races.json'] },
    { type: 'local', readJson: async () => data },
  )
}

describe('subrace version materialization', () => {
  test.each([
    { name: 'Test (Family)', fullName: 'Test (Family; First)', savedName: 'First)' },
    { name: 'Test (2024)', fullName: 'Test (2024); First', savedName: 'First' },
  ])('preserves existing top-level version identities: $fullName', ({
    name,
    fullName,
    savedName,
  }) => {
    const races = parse({
      race: [{ ...parent, name, _versions: [{ name: fullName, resist: ['acid'] }] }],
    })
    const resolved = resolveRaceReference(
      { name, source: 'PHB', subraceName: savedName, subraceSource: 'PHB' },
      { racesByKey: buildRaceLookup(races) },
    )
    expect(resolved.subraceData?.name).toBe(savedName)
    expect(resolved.mergedRace?.resist).toEqual(['acid'])
  })

  test('keeps new version labels distinct when a parenthetical parent precedes an external semicolon', () => {
    const races = parse({
      race: [
        {
          ...parent,
          name: 'Test (2024)',
          subraces: [
            {
              source: 'HB',
              _versions: [
                { name: 'Test (2024); First', speed: 35 },
                { name: 'Test (2024); Second', speed: 40 },
              ],
            },
          ],
        },
      ],
    })
    expect(
      races[0].subraces?.filter((entry) => entry._isVersion).map((entry) => entry.name),
    ).toEqual(['First', 'Second'])
    const resolved = resolveRaceReference(
      { name: 'Test (2024)', source: 'PHB', subraceName: 'Second', subraceSource: 'HB' },
      { racesByKey: buildRaceLookup(races) },
    )
    expect(resolved.mergedRace?.speed).toBe(40)
  })

  test('merges parent mechanics and overwritten entries before version modifications', () => {
    const input = {
      race: [parent],
      subrace: [
        {
          name: 'Branch',
          source: 'HB',
          raceName: parent.name,
          raceSource: parent.source,
          ability: [{ wis: 1 }],
          traitTags: ['Subrace tag'],
          skillProficiencies: [{ survival: true }],
          languageProficiencies: [{ elvish: true }],
          entries: [
            { name: 'Base Trait', data: { overwrite: ' base trait ' }, entries: ['Subrace rule'] },
          ],
          _versions: [
            {
              name: 'Test Race (Branch; First)',
              source: 'VERSION',
              _mod: {
                'entries.0.entries': { mode: 'appendArr', items: 'Version rule' },
              },
            },
          ],
        },
      ],
    }
    const before = structuredClone(input)
    const race = parse(input)[0]
    const version = race.subraces?.find((entry) => entry._isVersion)
    expect(version).toMatchObject({
      name: 'Branch; First',
      source: 'VERSION',
      speed: 30,
      ability: [{ dex: 2, wis: 1 }],
      darkvision: 60,
      skillProficiencies: [{ perception: true, survival: true }],
      languageProficiencies: [{ common: true }, { elvish: true }],
      traitTags: ['Parent tag', 'Subrace tag'],
    })
    expect(version?.entries).toEqual([
      {
        name: 'Base Trait',
        data: { overwrite: ' base trait ' },
        entries: ['Subrace rule', 'Version rule'],
      },
    ])
    expect(version?.presentationEntries).toEqual(version?.entries)
    expect(getRaceAbilityData(race, version).fixed).toEqual([
      { ability: 'dexterity', value: 2, source: 'subrace' },
      { ability: 'wisdom', value: 1, source: 'subrace' },
    ])
    expect(mergeRaceWithSubrace(race, version!)).toBe(version)
    expect(race.subraces?.[0]).not.toHaveProperty('_versions')
    expect(version).not.toHaveProperty('_versions')
    expect(input).toEqual(before)
  })

  test('expands nameless defaults against the complete parent and removes null fields', () => {
    const input = {
      race: [
        {
          ...parent,
          subraces: [
            {
              source: 'HB',
              darkvision: null,
              _versions: [
                {
                  _abstract: {
                    name: 'Test Race ({{option}})',
                    _mod: {
                      entries: {
                        mode: 'replaceArr',
                        replace: 'Base Trait',
                        items: { name: '{{option}}' },
                      },
                    },
                  },
                  _implementations: [
                    { _variables: { option: 'First' } },
                    { _variables: { option: 'Second' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const race = parse(input)[0]
    const versions = race.subraces?.filter((entry) => entry._isVersion) ?? []
    expect(versions.map((entry) => entry.name)).toEqual(['First', 'Second'])
    expect(versions[0]).toMatchObject({
      source: 'HB',
      speed: 30,
      ability: [{ dex: 2 }],
      entries: [{ name: 'First' }],
    })
    expect(versions[0]).not.toHaveProperty('darkvision')
  })

  test('honors subrace overwrite arrays and keeps separate families with semicolons in parentheses', () => {
    const branches = ['First Family', 'Second Family'].map((name) => ({
      name,
      source: 'HB',
      raceName: parent.name,
      raceSource: parent.source,
      ability: [{ wis: 3 }],
      traitTags: ['Own tag'],
      skillProficiencies: [{ arcana: true }],
      languageProficiencies: [{ draconic: true }],
      overwrite: {
        ability: true,
        traitTags: true,
        skillProficiencies: true,
        languageProficiencies: true,
      },
      _versions: [{ name: `Test Race (${name}; Black)` }],
    }))
    const race = parse({
      race: [{ ...parent, ability: [{ dex: 2 }, { con: 2 }] }],
      subrace: branches,
    })[0]
    const versions = race.subraces?.filter((entry) => entry._isVersion) ?? []
    expect(versions.map((entry) => entry.name)).toEqual([
      'First Family; Black',
      'Second Family; Black',
    ])
    expect(versions[0]).toMatchObject({
      ability: [{ wis: 3 }],
      traitTags: ['Own tag'],
      skillProficiencies: [{ arcana: true }],
      languageProficiencies: [{ draconic: true }],
    })
  })

  test('does not expand parent version definitions again for a child family', () => {
    const race = parse({
      race: [
        {
          ...parent,
          _versions: [{ name: 'Test Race; Parent Option', speed: 50 }],
          subraces: [
            { name: 'Branch', source: 'HB', _versions: [{ name: 'Test Race (Child Option)' }] },
          ],
        },
      ],
    })[0]
    const versions = race.subraces?.filter((entry) => entry._isVersion) ?? []
    expect(versions.map((entry) => entry.name)).toEqual(['Child Option', 'Parent Option'])
    expect(versions.map((entry) => entry.speed)).toEqual([30, 50])
  })

  test('expands copied subrace versions using the exact source-qualified parent', () => {
    const race = parse({
      race: [parent, { ...parent, source: 'OTHER', speed: 99 }],
      subrace: [
        {
          name: 'Branch',
          source: 'HB',
          raceName: parent.name,
          raceSource: parent.source,
          ability: [{ wis: 1 }],
          entries: ['Subrace rule'],
        },
        {
          name: 'Copied',
          source: 'COPY',
          _copy: {
            name: 'Branch',
            source: 'HB',
            raceName: parent.name,
            raceSource: parent.source,
          },
          _versions: [{ name: 'Test Race (Copied; Complete)' }],
        },
      ],
    })[0]
    expect(race.subraces?.find((entry) => entry._isVersion)).toMatchObject({
      name: 'Copied; Complete',
      source: 'COPY',
      speed: 30,
      ability: [{ dex: 2, wis: 1 }],
      entries: [...parent.entries, 'Subrace rule'],
    })
  })

  test.each([
    { ability: [{ wis: 1 }, { con: 1 }], _versions: [{ name: 'Test Race (Invalid)' }] },
    {
      skillProficiencies: [{ arcana: true }, { survival: true }],
      _versions: [{ name: 'Test Race (Invalid)' }],
    },
    { _versions: [{ name: 'Test Race (Invalid)', _mod: { entries: { mode: 'unsupported' } } }] },
  ])('rejects ambiguous merges or unapplied version operations without mutating input: %j', (invalid) => {
    const input = {
      race: [parent],
      subrace: [
        {
          name: 'Invalid',
          source: 'HB',
          raceName: parent.name,
          raceSource: parent.source,
          ...invalid,
        },
      ],
    }
    const before = structuredClone(input)
    expect(() => parse(input)).toThrow(/Unable to resolve/)
    expect(input).toEqual(before)
  })

  test('loader reports unsupported nested versions as a required failure', async () => {
    const onResourceFailure = vi.fn()
    await expect(
      load({
        race: [parent],
        subrace: [
          {
            name: 'Branch',
            source: 'HB',
            raceName: parent.name,
            raceSource: parent.source,
            _versions: [
              { name: 'Test Race (Invalid)', _mod: { entries: { mode: 'unsupported' } } },
            ],
          },
        ],
      }).loadAllData({ onResourceFailure }),
    ).rejects.toThrow(/unsupported _mod mode/)
    expect(onResourceFailure).toHaveBeenCalledWith(expect.stringContaining('_versions'), {
      required: true,
    })
  })

  test('rebuilds subrace versions after a later raw layer replaces the parent', async () => {
    const base = await load({
      race: [parent],
      subrace: [
        {
          name: 'Branch',
          source: 'HB',
          raceName: parent.name,
          raceSource: parent.source,
          _versions: [{ name: 'Test Race (Complete)', source: 'VERSION' }],
        },
      ],
    }).loadAllData()
    const update = await load({ race: [{ ...parent, speed: 45 }] }).loadAllData()
    const composed = composeGameDataLayers([base, update])
    expect(base.races[0].subraces?.find((entry) => entry._isVersion)?.speed).toBe(30)
    expect(composed.races[0].subraces?.find((entry) => entry._isVersion)?.speed).toBe(45)
    expect(composed.sources).toContainEqual(expect.objectContaining({ abbreviation: 'VERSION' }))
  })

  test('defers a child-only layer until its exact parent is available', async () => {
    const base = await load({ race: [parent] }).loadAllData()
    const extra = await load({
      race: [],
      subrace: [
        {
          name: 'Branch',
          source: 'HB',
          raceName: parent.name,
          raceSource: parent.source,
          _versions: [{ name: 'Test Race (Complete)' }],
        },
      ],
    }).loadAllData({ deferCopyResolutionErrors: true })
    expect(
      composeGameDataLayers([base, extra]).races[0].subraces?.find((entry) => entry._isVersion),
    ).toMatchObject({ speed: 30, ability: [{ dex: 2 }] })
    expect(() => composeGameDataLayers([extra])).toThrow(/missing parent race/)
  })
})

const corpusPath = join(process.cwd(), 'data/races.json')
describe.runIf(existsSync(corpusPath))('real subrace version families', () => {
  test.each([
    {
      name: 'Dragonborn (Chromatic)',
      savedName: 'Black)',
      resist: [{ choose: { from: ['acid', 'lightning', 'poison', 'fire', 'cold'] } }],
    },
    { name: 'Dragonborn (Gem)', savedName: 'Amethyst)', resist: ['force'] },
    { name: 'Dragonborn (Metallic)', savedName: 'Brass)', resist: ['fire'] },
  ])('resolves saved FTD selections without changing their identities: $name', ({
    name,
    savedName,
    resist,
  }) => {
    const races = parse(JSON.parse(readFileSync(corpusPath, 'utf8')))
    const resolved = resolveRaceReference(
      { name, source: 'FTD', subraceName: savedName, subraceSource: 'FTD' },
      { racesByKey: buildRaceLookup(races) },
    )
    expect(resolved.subraceData?.name).toBe(savedName)
    expect(resolved.mergedRace?.resist).toEqual(resist)
  })

  test('materializes all seven omitted families with inherited and overwritten mechanics', () => {
    const raw = JSON.parse(readFileSync(corpusPath, 'utf8'))
    const before = structuredClone(raw)
    const races = parse(raw)
    const dragonborn = races.find((race) => race.name === 'Dragonborn' && race.source === 'PHB')!
    const versions = dragonborn.subraces?.filter((entry) => entry._isVersion) ?? []
    expect(versions).toHaveLength(30)
    expect(
      versions.find((entry) => entry.name === 'Black' && entry.source === 'PHB'),
    ).toMatchObject({
      resist: ['acid'],
      speed: 30,
      ability: [{ str: 2, cha: 1 }],
    })
    expect(
      versions.find((entry) => entry.name === 'Draconblood; Black' && entry.source === 'EGW'),
    ).toMatchObject({ ability: [{ int: 2, cha: 1 }], darkvision: 60 })
    expect(
      versions.find((entry) => entry.name === 'Ravenite; Black' && entry.source === 'EGW'),
    ).toMatchObject({ ability: [{ str: 2, con: 1 }], darkvision: 60 })
    expect(new Set(versions.map((entry) => `${entry.name}|${entry.source}`)).size).toBe(30)
    const halfElf = races.find((race) => race.name === 'Half-Elf' && race.source === 'PHB')!
    expect(
      halfElf.subraces?.filter((entry) => entry._isVersion && entry.source === 'SCAG'),
    ).toHaveLength(11)
    for (const race of races)
      for (const subrace of race.subraces ?? []) {
        expect(subrace).not.toHaveProperty('_versions')
        expect(subrace).not.toHaveProperty('_copy')
      }
    expect(raw).toEqual(before)
  })
})
