import { describe, expect, test } from 'vitest'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'

const RACE: Race5e = { name: 'Human', source: 'XPHB' }
const CLASS_ENTITY = { name: 'Cleric', source: 'XPHB' } as unknown as Class5e
const BACKGROUND: Background5e = {
  name: 'Acolyte',
  source: 'XPHB',
  feats: [{ 'magic initiate; cleric|xphb': true }],
}

const resolveRaceChoiceOptions = () => []

describe('buildInitialCharacter (2024 origin system)', () => {
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
})
