import { describe, expect, test } from 'vitest'
import { makeDefaultAbilityScores, makeEmptyAbilityBonuses } from '@/lib/calculations/abilityScores'
import {
  calculateMaxHP,
  calculateMaxHPFromScores,
  canGainLevel,
  countAvailableASIs,
  getCharacterProficiencyBonus,
  getPrimaryClass,
  getTotalLevel,
  isMaxLevel,
  matchesGameDataEntry,
  type Progression,
} from '@/lib/characterUtils'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

describe('characterUtils', () => {
  test('getTotalLevel sums class levels', () => {
    const progression: Progression = {
      classes: [
        { name: 'Fighter', levels: 3 },
        { name: 'Wizard', levels: 2 },
      ],
    }

    expect(getTotalLevel(progression)).toBe(5)
  })

  test('getPrimaryClass returns first class in progression', () => {
    const progression: Progression = {
      classes: [
        { name: 'Cleric', levels: 1 },
        { name: 'Rogue', levels: 1 },
      ],
    }

    expect(getPrimaryClass(progression)?.name).toBe('Cleric')
  })

  test('getCharacterProficiencyBonus uses total level progression table', () => {
    const progression: Progression = {
      classes: [{ name: 'Bard', levels: 5 }],
    }

    expect(getCharacterProficiencyBonus(progression)).toBe(3)
  })

  test('matchesGameDataEntry matches name and source when source exists', () => {
    expect(matchesGameDataEntry('Alert', 'phb', { name: 'Alert', source: 'phb' })).toBe(true)
    expect(matchesGameDataEntry('Alert', 'xphb', { name: 'Alert', source: 'phb' })).toBe(false)
  })

  test('countAvailableASIs uses class data levels and includes variant human bonus', () => {
    const progression: Progression = {
      classes: [
        { name: 'Fighter', levels: 6 },
        { name: 'Wizard', levels: 4 },
      ],
    }

    const classesData = [
      makeClassFixture({
        name: 'Fighter',
        classFeatures: [
          'Ability Score Improvement|Fighter|PHB|4',
          'Ability Score Improvement|Fighter|PHB|6',
          'Ability Score Improvement|Fighter|PHB|8',
        ],
      }),
      makeClassFixture({
        name: 'Wizard',
        classFeatures: ['Ability Score Improvement|Wizard|PHB|4'],
      }),
    ]

    expect(countAvailableASIs(progression, { name: 'Variant Human' }, classesData)).toBe(4)
  })

  test('calculateMaxHP computes multiclass average hit points', () => {
    const progression: Progression = {
      classes: [
        { name: 'Fighter', levels: 3 },
        { name: 'Wizard', levels: 2 },
      ],
    }

    const classesData = [
      makeClassFixture({ name: 'Fighter', hd: { faces: 10 } }),
      makeClassFixture({ name: 'Wizard', hd: { faces: 6 } }),
    ]

    expect(calculateMaxHP(progression, 2, { averageHp: true, classesData })).toBe(40)
  })

  test('calculateMaxHPFromScores uses constitution totals and caps effective CON at 20', () => {
    const progression: Progression = {
      classes: [{ name: 'Fighter', levels: 1 }],
    }
    const scores = makeDefaultAbilityScores(10)
    const bonuses = makeEmptyAbilityBonuses()
    bonuses.constitution.push({ value: 16, source: 'Test Bonus' })
    const classesData = [makeClassFixture({ name: 'Fighter', hd: { faces: 10 } })]

    expect(calculateMaxHPFromScores(progression, scores, bonuses, { classesData })).toBe(15)
  })

  test('isMaxLevel and canGainLevel honor level 20 boundaries', () => {
    const capped: Progression = {
      classes: [{ name: 'Cleric', levels: 20 }],
    }
    const nearCap: Progression = {
      classes: [{ name: 'Cleric', levels: 19 }],
    }

    expect(isMaxLevel(capped)).toBe(true)
    expect(canGainLevel(capped)).toBe(false)
    expect(isMaxLevel(nearCap)).toBe(false)
    expect(canGainLevel(nearCap)).toBe(true)
    expect(canGainLevel(nearCap, 2)).toBe(false)
  })
})
