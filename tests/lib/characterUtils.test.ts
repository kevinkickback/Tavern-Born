import { describe, expect, test } from 'vitest'
import {
  calculateMaxHP,
  getEffectiveMaxHP,
  getTotalClassLevels,
  matchesGameDataEntry,
} from '@/lib/characterUtils'
import type { CharacterClassEntry } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

describe('characterUtils', () => {
  test('getTotalClassLevels sums class levels', () => {
    const progression: CharacterClassEntry[] = [
      { name: 'Fighter', levels: 3 },
      { name: 'Wizard', levels: 2 },
    ]

    expect(getTotalClassLevels(progression)).toBe(5)
  })

  test('matchesGameDataEntry matches name and source when source exists', () => {
    expect(matchesGameDataEntry('Alert', 'phb', { name: 'Alert', source: 'phb' })).toBe(true)
    expect(matchesGameDataEntry('Alert', 'xphb', { name: 'Alert', source: 'phb' })).toBe(false)
  })

  test('calculateMaxHP computes multiclass average hit points', () => {
    const progression: CharacterClassEntry[] = [
      { name: 'Fighter', levels: 3 },
      { name: 'Wizard', levels: 2 },
    ]

    const classesData = [
      makeClassFixture({ name: 'Fighter', hd: { faces: 10 } }),
      makeClassFixture({ name: 'Wizard', hd: { faces: 6 } }),
    ]

    expect(calculateMaxHP(progression, 2, { averageHp: true, classesData })).toBe(40)
  })

  test('calculateMaxHP uses recorded rolls and reapplies the current CON modifier', () => {
    const progression: CharacterClassEntry[] = [
      { name: 'Fighter', source: 'PHB', levels: 3 },
      { name: 'Wizard', source: 'PHB', levels: 2 },
    ]
    const classesData = [
      makeClassFixture({ name: 'Fighter', source: 'PHB', hd: { faces: 10 } }),
      makeClassFixture({ name: 'Wizard', source: 'PHB', hd: { faces: 6 } }),
    ]
    const hitPointGains = [
      {
        className: 'Fighter',
        classSource: 'PHB',
        classLevel: 2,
        characterLevel: 2,
        hitDie: 10,
        dieResult: 1,
        method: 'rolled' as const,
      },
      {
        className: 'Fighter',
        classSource: 'PHB',
        classLevel: 3,
        characterLevel: 3,
        hitDie: 10,
        dieResult: 10,
        method: 'manual' as const,
      },
      {
        className: 'Wizard',
        classSource: 'PHB',
        classLevel: 1,
        characterLevel: 4,
        hitDie: 6,
        dieResult: 3,
        method: 'rolled' as const,
      },
      {
        className: 'Wizard',
        classSource: 'PHB',
        classLevel: 2,
        characterLevel: 5,
        hitDie: 6,
        dieResult: 4,
        method: 'average' as const,
      },
    ]

    expect(calculateMaxHP(progression, 2, { classesData, hitPointGains })).toBe(38)
    expect(calculateMaxHP(progression, 4, { classesData, hitPointGains })).toBe(48)
  })

  test('per-level HP adjustments grow automatically when the character levels', () => {
    const fighter = makeClassFixture({ name: 'Fighter', source: 'PHB', hd: { faces: 10 } })
    const character = {
      ...makeCharacterFixture({
        class: 'Fighter',
        classSource: 'PHB',
        level: 1,
        classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        hitPoints: { max: 0, current: 10, temporary: 0 },
        hitPointAdjustments: [
          {
            id: 'toughness',
            label: 'Toughness',
            amount: 2,
            mode: 'per-level' as const,
            sourceType: 'feat' as const,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    }

    expect(getEffectiveMaxHP(character, [fighter])).toBe(12)
    expect(
      getEffectiveMaxHP(
        {
          ...character,
          level: 2,
          classProgression: [{ name: 'Fighter', source: 'PHB', levels: 2 }],
        },
        [fighter],
      ),
    ).toBe(20)
  })
})
