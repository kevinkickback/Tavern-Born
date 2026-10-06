import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseRaces } from '@/lib/5etools/parsers/races'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { addGrant, emptyProvenance, makeSourceTag } from '@/lib/provenance'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const noChoices = () => []
const parse = (data: unknown) => parseRaces(data) as Race5e[]
const proficiencyFields = {
  skillProficiencies: [{ perception: true }],
  languageProficiencies: [{ elvish: true }],
  toolProficiencies: [{ flute: true }],
  armorProficiencies: [{ light: true }],
  weaponProficiencies: [{ 'dagger|phb': true }],
}
const sharedValues = {
  skills: 'perception',
  languages: 'elvish',
  tools: 'flute',
  armor: 'light',
  weapons: 'dagger',
} as const

describe('race grant reconciliation', () => {
  test('complete string-lineage versions own one Common grant and language choice, including the materialized value', () => {
    const race = parse({
      race: [
        {
          name: 'Lineage',
          source: 'MPMM',
          lineage: 'VRGR',
          _versions: [{ name: 'Lineage; Complete' }],
        },
      ],
    })[0]
    const character = makeCharacterFixture({ race: '', raceSource: '' })
    const result = applyRaceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      race.subraces?.[0],
      0,
      noChoices,
    )
    expect(result.characterPatch.proficiencies?.languages).toContain('common')
    expect(result.provenanceUpdate.proficiencies.languages.common).toEqual([
      expect.objectContaining({ sourceType: 'subrace', sourceName: 'Complete', sourceRef: 'MPMM' }),
    ])
    expect(
      result.provenanceUpdate.choices.filter((choice) => choice.domain === 'languages'),
    ).toEqual([
      expect.objectContaining({
        chooseCount: 1,
        sourceTag: expect.objectContaining({ sourceType: 'subrace', sourceName: 'Complete' }),
      }),
    ])
  })

  test.each([
    { lineage: 'VRGR', languageProficiencies: [], languages: [] },
    { lineage: 'VRGR', languageProficiencies: [{ elvish: true }], languages: ['elvish'] },
    { lineage: true, languageProficiencies: undefined, languages: [] },
    { lineage: null, languageProficiencies: undefined, languages: [] },
  ])('does not invent fallback languages for explicit blocks, boolean lineage or removed lineage: %j', (version) => {
    const race = parse({
      race: [
        {
          name: 'Lineage',
          source: 'MPMM',
          lineage: 'VRGR',
          _versions: [
            {
              name: 'Lineage; Complete',
              lineage: version.lineage,
              ...(version.languageProficiencies
                ? { languageProficiencies: version.languageProficiencies }
                : {}),
            },
          ],
        },
      ],
    })[0]
    const character = makeCharacterFixture({ race: '', raceSource: '' })
    const result = applyRaceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      race.subraces?.[0],
      0,
      noChoices,
    )
    expect(result.characterPatch.proficiencies?.languages).toEqual(version.languages)
    expect(Object.keys(result.provenanceUpdate.proficiencies.languages)).toEqual(version.languages)
    expect(
      result.provenanceUpdate.choices.filter((choice) => choice.domain === 'languages'),
    ).toEqual([])
  })

  test.each([
    { languageProficiencies: undefined, languages: ['common'], choices: 1 },
    { languageProficiencies: [], languages: [], choices: 0 },
  ])('parents preserve explicit empty language blocks and use fallback only when absent: %j', (entry) => {
    const race = {
      name: 'Lineage',
      source: 'MPMM',
      lineage: 'VRGR',
      languageProficiencies: entry.languageProficiencies,
    } as Race5e
    const result = applyRaceSelectionCommand(
      makeCharacterFixture({ race: '', raceSource: '' }),
      emptyProvenance(),
      race,
      undefined,
      0,
      noChoices,
    )
    expect(result.characterPatch.proficiencies?.languages).toEqual(entry.languages)
    expect(Object.keys(result.provenanceUpdate.proficiencies.languages)).toEqual(entry.languages)
    expect(
      result.provenanceUpdate.choices.filter((choice) => choice.domain === 'languages'),
    ).toHaveLength(entry.choices)
  })

  test('a traditional subrace does not duplicate its string-lineage parent fallback', () => {
    const race = parse({
      race: [
        {
          name: 'Lineage',
          source: 'MPMM',
          lineage: 'VRGR',
          subraces: [{ name: 'Traditional', source: 'HB', lineage: 'VRGR' }],
        },
      ],
    })[0]
    const character = makeCharacterFixture({ race: '', raceSource: '' })
    const result = applyRaceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      race.subraces?.[0],
      0,
      noChoices,
    )
    expect(result.provenanceUpdate.proficiencies.languages.common).toEqual([
      expect.objectContaining({ sourceType: 'race' }),
    ])
    expect(
      result.provenanceUpdate.choices.filter((choice) => choice.domain === 'languages'),
    ).toHaveLength(1)
  })

  test('2024 origins suppress version fallback and preserve only their independent origin language ownership', () => {
    const race = parse({
      race: [
        {
          name: 'Lineage',
          source: 'MPMM',
          lineage: 'VRGR',
          _versions: [{ name: 'Lineage; Complete' }],
        },
      ],
    })[0]
    const initial = makeCharacterFixture({
      originSystem: '2024',
      race: '',
      raceSource: '',
      proficiencies: { ...makeCharacterFixture().proficiencies, languages: ['common'] },
    })
    const result = applyRaceSelectionCommand(
      initial,
      emptyProvenance(),
      race,
      race.subraces?.[0],
      0,
      noChoices,
    )
    expect(result.characterPatch.proficiencies?.languages).toEqual(['common'])
    expect(result.provenanceUpdate.proficiencies.languages.common).toEqual([
      expect.objectContaining({ sourceType: 'manual' }),
    ])
    expect(
      result.provenanceUpdate.choices.filter((choice) => choice.domain === 'languages'),
    ).toEqual([
      expect.objectContaining({
        chooseCount: 2,
        sourceTag: expect.objectContaining({ sourceType: 'manual' }),
      }),
    ])
  })

  test.each([
    'version',
    'race',
  ] as const)('removing overlapping old owners through a %s transition retracts all five materialized domains', (transition) => {
    const race = parse({
      race: [
        {
          name: 'Parent',
          source: 'HB',
          ...proficiencyFields,
          subraces: [{ name: 'Traditional', source: 'HB', ...proficiencyFields }],
          _versions: [
            {
              name: 'Parent; Removed',
              ...Object.fromEntries(Object.keys(proficiencyFields).map((key) => [key, null])),
            },
          ],
        },
      ],
    })[0]
    const original = makeCharacterFixture({
      race: '',
      raceSource: '',
      proficiencies: {
        skills: ['arcana'],
        expertise: [],
        languages: ['dwarvish'],
        tools: ['viol'],
        armor: ['medium'],
        weapons: ['club'],
        savingThrows: ['strength'],
      },
    })
    const initial = applyRaceSelectionCommand(
      original,
      emptyProvenance(),
      race,
      race.subraces?.[0],
      0,
      noChoices,
    )
    for (const [domain, value] of Object.entries(sharedValues))
      expect(
        initial.provenanceUpdate.proficiencies[domain as keyof typeof sharedValues][value],
      ).toHaveLength(2)
    const current = {
      ...original,
      ...initial.characterPatch,
      proficiencies: { ...initial.characterPatch.proficiencies!, expertise: ['perception'] },
    }
    const result =
      transition === 'version'
        ? applySubraceSelectionCommand(
            current,
            initial.provenanceUpdate,
            race,
            race.subraces?.find((subrace) => subrace._isVersion),
            noChoices,
          )
        : applyRaceSelectionCommand(
            current,
            initial.provenanceUpdate,
            { name: 'Other', source: 'HB' } as Race5e,
            undefined,
            0,
            noChoices,
          )
    expect(result.characterPatch.proficiencies).toEqual(original.proficiencies)
    for (const [domain, value] of Object.entries(sharedValues))
      expect(
        result.provenanceUpdate.proficiencies[domain as keyof typeof sharedValues][value],
      ).toBeUndefined()
  })

  test.each([
    'manual',
    'background',
  ] as const)('an unrelated %s owner preserves shared proficiencies when both racial owners leave', (owner) => {
    const race = parse({
      race: [
        {
          name: 'Parent',
          source: 'HB',
          ...proficiencyFields,
          subraces: [{ name: 'Traditional', source: 'HB', ...proficiencyFields }],
        },
      ],
    })[0]
    const original = makeCharacterFixture({ race: '', raceSource: '' })
    const initial = applyRaceSelectionCommand(
      original,
      emptyProvenance(),
      race,
      race.subraces?.[0],
      0,
      noChoices,
    )
    let ledger = initial.provenanceUpdate
    for (const [domain, value] of Object.entries(sharedValues))
      ledger = addGrant(
        ledger,
        domain as keyof typeof sharedValues,
        value,
        makeSourceTag(owner, 'Independent', 'fixed'),
      )
    const result = applyRaceSelectionCommand(
      { ...original, ...initial.characterPatch },
      ledger,
      { name: 'Other', source: 'HB' } as Race5e,
      undefined,
      0,
      noChoices,
    )
    for (const [domain, value] of Object.entries(sharedValues)) {
      expect(
        result.characterPatch.proficiencies?.[domain as keyof typeof sharedValues].map((name) =>
          name.toLowerCase(),
        ),
      ).toContain(value)
      expect(
        result.provenanceUpdate.proficiencies[domain as keyof typeof sharedValues][value],
      ).toEqual([expect.objectContaining({ sourceType: owner, sourceName: 'Independent' })])
    }
  })

  test('traditional child replacement preserves grants still owned by its parent', () => {
    const race = parse({
      race: [
        {
          name: 'Parent',
          source: 'HB',
          ...proficiencyFields,
          subraces: [
            { name: 'Traditional', source: 'HB', ...proficiencyFields },
            { name: 'New Child', source: 'HB' },
          ],
        },
      ],
    })[0]
    const original = makeCharacterFixture({ race: '', raceSource: '' })
    const initial = applyRaceSelectionCommand(
      original,
      emptyProvenance(),
      race,
      race.subraces?.[0],
      0,
      noChoices,
    )
    const result = applySubraceSelectionCommand(
      { ...original, ...initial.characterPatch },
      initial.provenanceUpdate,
      race,
      race.subraces?.[1],
      noChoices,
    )
    for (const [domain, value] of Object.entries(sharedValues)) {
      expect(
        result.characterPatch.proficiencies?.[domain as keyof typeof sharedValues].map((name) =>
          name.toLowerCase(),
        ),
      ).toContain(value)
      expect(
        result.provenanceUpdate.proficiencies[domain as keyof typeof sharedValues][value],
      ).toEqual([expect.objectContaining({ sourceType: 'race', sourceName: 'Parent' })])
    }
  })
})

const racesPath = join(process.cwd(), 'data/races.json')
describe.runIf(existsSync(racesPath))('real complete lineage selections', () => {
  test('all three MPMM Aasimar versions retain their inherited legacy-origin language benefits', () => {
    const race = parse(JSON.parse(readFileSync(racesPath, 'utf8'))).find(
      (race) => race.name === 'Aasimar' && race.source === 'MPMM',
    )!
    const versions = race.subraces?.filter((version) => version._isVersion) ?? []
    expect(versions).toHaveLength(3)
    for (const version of versions) {
      const character = makeCharacterFixture({ race: '', raceSource: '' })
      const result = applyRaceSelectionCommand(
        character,
        emptyProvenance(),
        race,
        version,
        0,
        noChoices,
      )
      expect(result.characterPatch.proficiencies?.languages).toEqual(['common'])
      expect(result.provenanceUpdate.proficiencies.languages.common).toEqual([
        expect.objectContaining({
          sourceType: 'subrace',
          sourceName: version.name,
          sourceRef: 'MPMM',
        }),
      ])
      expect(
        result.provenanceUpdate.choices.filter((choice) => choice.domain === 'languages'),
      ).toEqual([
        expect.objectContaining({
          chooseCount: 1,
          sourceTag: expect.objectContaining({ sourceType: 'subrace', sourceName: version.name }),
        }),
      ])
    }
  })
})
