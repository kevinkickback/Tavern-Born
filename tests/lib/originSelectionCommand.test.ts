import { describe, expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'

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
    expect(issueIds).not.toContain('choice:subrace:variant:abilityBonuses:choose:0')
    expect(issueIds).toContain('choice:subrace:variant:feats:any:0')
  })
})
