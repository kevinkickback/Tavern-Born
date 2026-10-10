import { expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { parseRaceSpellBlocks } from '@/lib/5etools/raceSpells'
import { buildRacialSpellcastingDetails } from '@/lib/calculations/spellProfiles.casting'
import { setRacialSpellChoice, setRacialSpellSuite } from '@/lib/character/commands/spellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Race5e, Spell5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { makeNativeRacialCharacter, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'

const filteredRace: Race5e = {
  name: 'Filtered caster',
  source: 'PHB',
  additionalSpells: [{ known: { 1: { _: [{ choose: 'level=0|class=Wizard' }] } } }],
}
const wizardLight = makeSpellFixture({
  name: 'Light',
  level: 0,
  classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
})

test.each([
  [
    'wrong class',
    'Sacred Flame|PHB',
    [
      makeSpellFixture({
        name: 'Sacred Flame',
        level: 0,
        classes: { fromClassList: [{ name: 'Cleric', source: 'PHB' }] },
      }),
    ],
  ],
  [
    'wrong level',
    'Magic Missile|PHB',
    [makeSpellFixture({ classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] } })],
  ],
  ['missing exact printing', 'Light|PHB', [{ ...wizardLight, source: 'XPHB' }]],
  ['unavailable target metadata', 'Light|PHB', []],
] as const)('new filtered choices reject %s atomically', (_, reference, spells) => {
  const character = makeNativeRacialCharacter(filteredRace)
  const before = structuredClone(character)
  const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  const result = setRacialSpellChoice(
    character,
    character.provenance,
    profile.id,
    profile.choices![0].id,
    [reference],
    nativeRaceResolution(filteredRace),
    buildSpellLookup([...spells] as Spell5e[]),
  )
  expect(result.characterPatch).toEqual({})
  expect(result.provenanceUpdate).toBe(character.provenance)
  expect(character).toEqual(before)
})

test('valid exact filtered selection admits, retains offline, and clears without rules or target metadata', () => {
  let character = makeNativeRacialCharacter(filteredRace)
  const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  const apply = (result: ReturnType<typeof setRacialSpellChoice>) => {
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  apply(
    setRacialSpellChoice(
      character,
      character.provenance,
      profile.id,
      profile.choices![0].id,
      ['Light|PHB'],
      nativeRaceResolution(filteredRace),
      buildSpellLookup([wizardLight]),
    ),
  )
  expect(character.spells.spellProfiles.find((entry) => entry.id === profile.id)!.cantrips).toEqual(
    ['Light|PHB'],
  )
  apply(
    setRacialSpellChoice(character, character.provenance, profile.id, profile.choices![0].id, [
      'Light|PHB',
    ]),
  )
  expect(character.provenance.spells.light).toHaveLength(1)
  apply(
    setRacialSpellChoice(character, character.provenance, profile.id, profile.choices![0].id, []),
  )
  expect(character.provenance.spells.light).toBeUndefined()
})

test.each([
  ['rest', '0'],
  ['rest', 'pb'],
  ['rest', '01'],
  ['daily', '01'],
  ['daily', '0'],
] as const)('native %s:%s rejects before materialization', (bucket, uses) => {
  expect(() =>
    parseRaceSpellBlocks([
      { innate: { 1: { [bucket]: { [uses]: [{ choose: 'level=0|class=Wizard' }] } } } },
    ]),
  ).toThrow(/native spell .* limit/i)
})

test.each([
  ['rest', '1'],
  ['rest', '2e'],
  ['daily', '1'],
  ['daily', '2e'],
  ['daily', 'pb'],
] as const)('canonical native %s:%s remains strictly admissible', (bucket, uses) => {
  const race: Race5e = {
    name: 'Usage caster',
    source: 'PHB',
    additionalSpells: [
      { innate: { 1: { [bucket]: { [uses]: [{ choose: 'level=0|class=Wizard' }] } } } },
    ],
  }
  const character = makeNativeRacialCharacter(race)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  expect(
    character.spells.spellProfiles.find((entry) => entry.type === 'racial')!.choices![0].usage,
  ).toBe(`${bucket}:${uses}`)
})

test('unselected alternatives stay configurable without casting summaries or racial PDF pages', () => {
  const race: Race5e = {
    name: 'Astral Elf',
    source: 'AAG',
    additionalSpells: [
      { ability: 'int', known: { 1: ['light#c'] } },
      { ability: 'wis', known: { 1: ['mage hand#c'] } },
    ],
  }
  const character = makeNativeRacialCharacter(race)
  const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  expect(profile.racial!.mode).toBe('alternative')
  expect(profile.racial!.suite).toBeUndefined()
  expect(buildRacialSpellcastingDetails(character, character.abilityScores)).toEqual([])
  expect(createCharacterSheetViewModel(character, {}).spellcastingPages).toEqual([])
  const emptyClear = setRacialSpellSuite(character, character.provenance, profile.id, undefined)
  expect(
    emptyClear.characterPatch.spells!.spellProfiles.find((entry) => entry.id === profile.id),
  ).toBeTruthy()
})
