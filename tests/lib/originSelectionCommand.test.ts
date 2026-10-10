import { describe, expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'

const RACE: Race5e = { name: 'Human', source: 'XPHB' }
const CLASS_ENTITY = { name: 'Cleric', source: 'XPHB' } as unknown as Class5e
const BACKGROUND: Background5e = {
  name: 'Acolyte',
  source: 'XPHB',
  feats: [{ 'magic initiate; cleric|xphb': true }],
}

const resolveRaceChoiceOptions = () => []

describe('buildInitialCharacter', () => {
  test('applying race, class, and background together does not throw', () => {
    expect(() =>
      buildInitialCharacter(
        {
          initial: { originSystem: '2024' },
          race: RACE,
          classEntity: CLASS_ENTITY,
          background: BACKGROUND,
        },
        new Map(),
        resolveRaceChoiceOptions,
      ),
    ).not.toThrow()
  })

  test('grants the background origin feat and the origin language baseline', () => {
    const character = buildInitialCharacter(
      {
        initial: { originSystem: '2024' },
        race: RACE,
        classEntity: CLASS_ENTITY,
        background: BACKGROUND,
      },
      new Map(),
      resolveRaceChoiceOptions,
    )

    expect(character.provenance?.feats['magic initiate']).toBeDefined()
    expect(character.provenance?.proficiencies.languages.common).toBeDefined()
    expect(
      character.provenance?.choices.filter(
        (choice) => choice.domain === 'languages' && choice.sourceTag.sourceType === 'manual',
      ),
    ).toHaveLength(1)
  })

  test('starts a new character at full health', () => {
    const fighter = {
      name: 'Fighter',
      source: 'PHB',
      hd: { faces: 10, number: 1 },
    } as Class5e
    const character = buildInitialCharacter(
      {
        initial: {
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 14,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
        },
        classEntity: fighter,
      },
      new Map(),
      resolveRaceChoiceOptions,
    )

    expect(character.hitPoints.current).toBe(12)
    expect(character.hitPointsInitialized).toBe(true)
  })

  test('includes an origin Constitution bonus in starting health', () => {
    const dwarf = {
      name: 'Dwarf',
      source: 'PHB',
      ability: [{ con: 2 }],
    } as Race5e
    const fighter = {
      name: 'Fighter',
      source: 'PHB',
      hd: { faces: 10, number: 1 },
    } as Class5e
    const character = buildInitialCharacter(
      {
        initial: {
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 14,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
        },
        race: dwarf,
        classEntity: fighter,
      },
      new Map(),
      resolveRaceChoiceOptions,
    )

    expect(character.hitPoints.current).toBe(13)
  })

  test('preserves the Variant Human feat and resolves wizard racial ability choices', () => {
    const human = {
      name: 'Human',
      source: 'PHB',
    } as Race5e
    const variant = {
      name: 'Variant',
      source: 'PHB',
      ability: [
        {
          choose: {
            from: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
            count: 2,
          },
        },
      ],
      feats: [{ any: 1 }],
    } as Race5e

    const character = buildInitialCharacter(
      {
        initial: { originSystem: '2014' },
        race: human,
        subrace: variant,
        raceAsiChoices: [['strength', 'dexterity']],
      },
      new Map(),
      resolveRaceChoiceOptions,
    )

    expect(character.raceAsiChoices).toEqual([['strength', 'dexterity']])
    expect(
      character.provenance?.choices.find((choice) => choice.domain === 'abilityBonuses'),
    ).toMatchObject({
      selected: ['strength', 'dexterity'],
      status: 'resolved',
    })
    expect(character.provenance?.choices.find((choice) => choice.domain === 'feats')).toMatchObject(
      {
        sourceTag: { sourceType: 'subrace', sourceName: 'Variant', sourceRef: 'PHB' },
        chooseCount: 1,
        status: 'pending',
      },
    )

    const calculation = createCharacterCalculationContext(character, {
      racesByKey: { 'Human|PHB': { ...human, subraces: [variant] } },
    })
    const issueIds = getCharacterReadiness(character, { calculation }).blockingIssues.map(
      (issue) => issue.id,
    )
    expect(issueIds).not.toContain('race:ability-choice:0')
    expect(issueIds).not.toContain('choice:subrace:variant|phb:abilityBonuses:choose:0')
    expect(issueIds).toContain('choice:subrace:variant:feats:any:0')
  })
})

test('Finish commits native grants at its final class level and strictly reopens without a later read repair', () => {
  const race: Race5e = {
    name: 'Tiefling',
    source: 'PHB',
    additionalSpells: [
      {
        ability: 'cha',
        known: { 1: ['thaumaturgy#c'] },
        innate: { 3: { daily: { 1: ['hellish rebuke#2'] } }, 5: { daily: { 1: ['darkness'] } } },
      },
    ],
  }
  const character = buildInitialCharacter(
    {
      initial: {
        name: 'Finished native caster',
        originSystem: '2014',
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 5 }],
      },
      race,
      classEntity: { name: 'Wizard', source: 'PHB', hd: { faces: 6, number: 1 } } as Class5e,
    },
    new Map(),
    () => [],
  )
  expect(character.classProgression).toEqual([
    { name: 'Wizard', source: 'PHB', levels: 5, subclass: undefined, subclassSource: undefined },
  ])
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
  expect(reopened.spells.spellProfiles.find((profile) => profile.type === 'racial')).toMatchObject({
    raceName: 'Tiefling',
    castingAbility: 'cha',
    cantrips: ['thaumaturgy|PHB'],
    spellsKnown: ['hellish rebuke|PHB', 'darkness|PHB'],
    racial: {
      fixed: [
        { reference: 'thaumaturgy|PHB', isCantrip: true },
        { reference: 'hellish rebuke|PHB', isCantrip: false, dailyUses: 1 },
        { reference: 'darkness|PHB', isCantrip: false, dailyUses: 1 },
      ],
    },
  })
  for (const target of ['thaumaturgy', 'hellish rebuke', 'darkness'])
    expect(reopened.provenance.spells[target]).toContainEqual(
      expect.objectContaining({
        sourceType: 'race',
        sourceName: 'Tiefling',
        sourceRef: 'PHB',
        grantType: 'fixed',
        grantSource: 'PHB',
      }),
    )
})
