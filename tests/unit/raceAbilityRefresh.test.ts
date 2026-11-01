import { expect, test } from 'vitest'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { makeDefaultAbilityScores } from '@/lib/calculations/abilityScores'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { applyRaceAsiChoicesCommand } from '@/lib/character/commands/raceCommands'
import { refreshRaceAbilityState } from '@/lib/character/raceAbilityState'
import { getAbilityBonusRows, makeSourceTag } from '@/lib/provenance'
import { getSelectedRaceAbilityChoices } from '@/lib/provenance/raceOwnership'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeClassFixture } from '../fixtures/gameDataFixtures'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'
import { selectRace } from '../fixtures/racialAbilityCharacter'

const choice = (from: string[], amount = 1, count = 1) => ({ choose: { from, amount, count } })
const parent = {
  name: 'Refresh target',
  source: 'PHB',
  ability: [choice(['str', 'dex'], 2)],
} as Race5e

test('fresh Wizard Finish uses the just-created Constitution choice for starting hit points', () => {
  const race = { ...parent, ability: [choice(['con'], 2)] }
  const fighter = makeClassFixture({ name: 'Fighter', source: 'PHB', hd: { number: 1, faces: 10 } })
  const finished = characterPersistenceSchema.parse(
    buildInitialCharacter(
      {
        initial: {
          name: 'Fresh Constitution',
          originSystem: '2014',
          abilityScores: makeDefaultAbilityScores(10),
        },
        race,
        classEntity: fighter,
        raceAsiChoices: [['constitution']],
      },
      new Map(),
      () => [],
    ),
  )
  expect(
    createCharacterCalculationContext(finished, { racesByKey: buildRaceLookup([race]) })
      .abilityScores.total.constitution,
  ).toBe(12)
  expect(finished.hitPoints.current).toBe(11)
})

test('parser-produced complete versions refresh only child ability ownership through restoration', () => {
  const [race] = parseRaces({
    race: [
      {
        name: 'Version parent',
        source: 'PHB',
        ability: [{ cha: 2 }],
        _versions: [{ name: 'Version child', source: 'HB', ability: [choice(['str', 'dex'], 2)] }],
      },
    ],
  }) as Race5e[]
  const child = race.subraces![0]
  const saved = selectRace(race, 0, [['strength']], child)
  const next = { ...child, ability: [choice(['str', 'wis'], 1, 2)] }
  const refreshed = refreshRaceAbilityState(saved, race, next)
  expect(refreshed.provenance!.choices).toMatchObject([
    {
      sourceTag: { sourceType: 'subrace', sourceName: child.name, sourceRef: 'HB' },
      amount: 1,
      chooseCount: 2,
      selected: ['strength'],
    },
  ])
  expect(createCharacterCalculationContext(refreshed, {}).abilityScores.racialBonuses).toEqual({
    strength: 1,
  })
  expect(refreshRaceAbilityState(refreshed, race, undefined)).toBe(refreshed)
  expect(characterPersistenceSchema.safeParse(refreshed).success).toBe(true)
})

test.each([
  { rule: choice(['con', 'wis']), picks: ['strength'], expected: [''], bonuses: {} },
  {
    rule: choice(['str', 'wis'], 1, 2),
    picks: ['strength'],
    expected: ['strength'],
    bonuses: { strength: 1 },
  },
  {
    rule: choice(['str', 'dex'], 3),
    picks: ['strength'],
    expected: ['strength'],
    bonuses: { strength: 3 },
  },
  { rule: choice(['str', 'dex'], 1, 1), picks: ['', 'dexterity'], expected: [''], bonuses: {} },
])('exact refreshed rules bound existing choices: $rule', ({ rule, picks, expected, bonuses }) => {
  const saved = characterPersistenceSchema.parse(selectRace(parent, 0, [picks]))
  const refreshed = { ...parent, ability: [rule] }
  const before = structuredClone(saved)
  const projected = refreshRaceAbilityState(saved, refreshed, undefined)
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(projected)))
  expect(reopened.raceAsiChoices).toEqual([expected])
  for (const racesByKey of [buildRaceLookup([refreshed]), {}])
    expect(
      createCharacterCalculationContext(reopened, { racesByKey }).abilityScores.racialBonuses,
    ).toEqual(bonuses)
  expect(refreshRaceAbilityState(projected, refreshed, undefined)).toBe(projected)
  expect(saved).toEqual(before)
})

test('reorder/insert/remove map unique blocks within their owner and never resurrect removed choices', () => {
  const a = choice(['str', 'dex'], 2)
  const b = choice(['con', 'wis'])
  const child = { name: 'Child', source: 'HB', ability: [choice(['cha'])] } as Race5e
  const race = { ...parent, ability: [a, b] }
  const saved = selectRace(race, 0, [['strength'], ['wisdom'], ['charisma']], child)
  saved.provenance!.choices.reverse()
  const reordered = refreshRaceAbilityState(saved, { ...race, ability: [b, a] }, child)
  expect(reordered.raceAsiChoices).toEqual([['wisdom'], ['strength'], ['charisma']])
  const inserted = refreshRaceAbilityState(
    reordered,
    { ...race, ability: [b, choice(['int']), a] },
    child,
  )
  expect(inserted.raceAsiChoices).toEqual([['wisdom'], [], ['strength'], ['charisma']])
  const removed = refreshRaceAbilityState(inserted, { ...race, ability: [b] }, child)
  expect(removed.raceAsiChoices).toEqual([['wisdom'], ['charisma']])
  const restored = refreshRaceAbilityState(removed, race, child)
  expect(restored.raceAsiChoices).toEqual([[], ['wisdom'], ['charisma']])
  expect(characterPersistenceSchema.safeParse(restored).success).toBe(true)
})

test('changed ambiguous duplicate and multiple residual blocks reset while unchanged duplicate layouts are no-ops', () => {
  const a = choice(['str', 'dex'])
  const race = { ...parent, ability: [a, a] }
  const saved = selectRace(race, 0, [['strength'], ['dexterity']])
  expect(refreshRaceAbilityState(saved, race, undefined)).toBe(saved)
  for (const ability of [
    [a],
    [a, a, choice(['wis'])],
    [choice(['str', 'con']), choice(['dex', 'wis'])],
  ]) {
    const projected = refreshRaceAbilityState(saved, { ...race, ability }, undefined)
    expect(projected.raceAsiChoices).toEqual(ability.map(() => []))
    expect(
      getSelectedRaceAbilityChoices(projected.provenance!, projected).every(
        (record) => record.status === 'pending',
      ),
    ).toBe(true)
  }
})

test('fixed changes and empty overwrite replace selected ability grants only, preserving independent benefits', () => {
  const child = { name: 'Child', source: 'HB', ability: [{ con: 1 }] } as Race5e
  const race = {
    ...parent,
    ability: [{ cha: 2, ...choice(['str', 'dex'], 2) }],
    languageProficiencies: [{ common: true }],
  }
  const saved = selectRace(race, 0, [['strength']], child)
  saved.provenance!.abilityBonuses.push({
    ability: 'wisdom',
    value: 1,
    sourceTag: makeSourceTag('feat', 'Independent', 'fixed', 'PHB'),
  })
  const changed = refreshRaceAbilityState(
    saved,
    { ...race, ability: [{ int: 1, ...choice(['str', 'dex'], 2) }] },
    child,
  )
  expect(changed.raceAsiChoices).toBe(saved.raceAsiChoices)
  expect(changed.provenance!.proficiencies).toBe(saved.provenance!.proficiencies)
  const empty = refreshRaceAbilityState(changed, race, {
    ...child,
    ability: [],
    overwrite: { ability: true },
  })
  expect(empty.raceAsiChoices).toEqual([])
  expect(empty.provenance!.abilityBonuses).toEqual([
    saved.provenance!.abilityBonuses[saved.provenance!.abilityBonuses.length - 1],
  ])
  expect(empty.provenance!.spells).toBe(saved.provenance!.spells)
  expect(characterPersistenceSchema.safeParse(empty).success).toBe(true)
})

test('exact parent and child identity conflicts freeze the complete snapshot and reject new intent', () => {
  const child = { name: 'Child', source: 'HB', ability: [choice(['wis'])] } as Race5e
  const saved = selectRace(parent, 0, [['strength'], ['wisdom']], child)
  for (const [race, subrace] of [
    [undefined, child],
    [parent, undefined],
    [{ ...parent, name: 'Other' }, child],
    [{ ...parent, source: 'OTHER' }, child],
    [parent, { ...child, name: 'Other' }],
    [parent, { ...child, source: 'OTHER' }],
  ] as const) {
    expect(refreshRaceAbilityState(saved, race, subrace)).toBe(saved)
    const edited = applyRaceAsiChoicesCommand(saved, saved.provenance!, [['dexterity']], {
      parentRace: race,
      subraceData: subrace,
    })
    expect(edited).toEqual({ characterPatch: {}, provenanceUpdate: saved.provenance })
  }
})

test('current explicit intent, readiness, immutable PDF and missing-data projection share the refreshed relation', () => {
  const saved = characterPersistenceSchema.parse(selectRace(parent, 0, [['strength']]))
  const refreshed = { ...parent, ability: [choice(['con', 'wis'])] }
  const lookups = { racesByKey: buildRaceLookup([refreshed]) }
  const calculation = createCharacterCalculationContext(saved, lookups)
  expect(calculation.character.raceAsiChoices).toEqual([['']])
  expect(
    getCharacterReadiness(saved, { calculation }).blockingIssues.some((issue) =>
      issue.id.startsWith('race:ability'),
    ),
  ).toBe(true)
  const command = applyRaceAsiChoicesCommand(saved, saved.provenance, [['wisdom']], {
    parentRace: refreshed,
    subraceData: undefined,
  })
  const edited = characterPersistenceSchema.parse({
    ...saved,
    ...command.characterPatch,
    provenance: command.provenanceUpdate,
  })
  expect(getAbilityBonusRows(edited.provenance).map((row) => row.itemName)).toEqual(['WIS +1'])
  const before = structuredClone(saved)
  const pdf = createCurrentCharacterSheetViewModel(edited, lookups)
  expect(pdf.effectiveAbilityScores.wisdom).toBe(11)
  expect(createCharacterCalculationContext(edited, {}).abilityScores.racialBonuses).toEqual({
    wisdom: 1,
  })
  expect(saved).toEqual(before)
})
