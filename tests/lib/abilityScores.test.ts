import { describe, expect, test } from 'vitest'
import {
  calculatePointBuyTotal,
  formatModifier,
  getAbilityModifierForCharacter,
  getAbilityScore,
  getAllAbilityModifiers,
  getRaceAbilityData,
  getRemainingPointBuy,
  getTotalAbilityScore,
  getValidPointBuyScores,
  isValidPointBuyScore,
  isValidStandardArrayAssignment,
  makeDefaultAbilityScores,
  makeEmptyAbilityBonuses,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'

type TestRaceAbilityEntry =
  | Partial<Record<string, number>>
  | {
      choose: {
        count?: number
        amount?: number
        from?: string[]
      }
    }

describe('abilityScores', () => {
  test('default scores and empty bonuses create expected shape', () => {
    expect(makeDefaultAbilityScores()).toEqual({
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    })
    expect(makeEmptyAbilityBonuses().strength).toEqual([])
  })

  test('total and effective ability scores are capped correctly', () => {
    expect(
      getTotalAbilityScore(18, [
        { value: 8, source: 'Feat A' },
        { value: 8, source: 'Feat B' },
      ]),
    ).toBe(30)

    expect(
      getAbilityScore(
        'strength',
        { ...makeDefaultAbilityScores(18), strength: 18 },
        {
          ...makeEmptyAbilityBonuses(),
          strength: [{ value: 8, source: 'Feat A' }],
        },
      ),
    ).toBe(20)
  })

  test('modifier helpers derive single and all modifiers', () => {
    const scores = makeDefaultAbilityScores(10)
    const bonuses = makeEmptyAbilityBonuses()
    bonuses.dexterity.push({ value: 4, source: 'Test' })

    expect(getAbilityModifierForCharacter('dexterity', scores, bonuses)).toBe(2)

    const all = getAllAbilityModifiers(scores, bonuses)
    expect(all.dexterity).toBe(2)
    expect(all.strength).toBe(0)
  })

  test('point-buy helpers compute totals and validity', () => {
    const scores = {
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    }

    expect(calculatePointBuyTotal(scores)).toBe(27)
    expect(getRemainingPointBuy(scores, 27)).toBe(0)
    expect(getValidPointBuyScores()).toEqual([8, 9, 10, 11, 12, 13, 14, 15])
    expect(isValidPointBuyScore(15)).toBe(true)
    expect(isValidPointBuyScore(16)).toBe(false)
  })

  test('standard array assignment rejects duplicates and unknown values', () => {
    expect(
      isValidStandardArrayAssignment({
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      }),
    ).toBe(true)

    expect(
      isValidStandardArrayAssignment({
        strength: 15,
        dexterity: 15,
      }),
    ).toBe(false)

    expect(
      isValidStandardArrayAssignment({
        strength: 17,
      }),
    ).toBe(false)
  })

  test('normalizeAbilityName and formatModifier handle common inputs', () => {
    expect(normalizeAbilityName('STR')).toBe('strength')
    expect(normalizeAbilityName('charisma')).toBe('charisma')
    expect(normalizeAbilityName('foo')).toBeNull()
    expect(formatModifier(2)).toBe('+2')
    expect(formatModifier(-1)).toBe('-1')
  })

  test('getRaceAbilityData extracts fixed and choosable bonuses', () => {
    const race: { ability: TestRaceAbilityEntry[] } = {
      ability: [{ str: 2 }, { choose: { count: 2, amount: 1, from: ['dex'] } }],
    }
    const subrace: { ability: TestRaceAbilityEntry[] } = {
      ability: [{ int: 1 }, { choose: { count: 1 } }],
    }

    const data = getRaceAbilityData(
      race as unknown as Parameters<typeof getRaceAbilityData>[0],
      subrace as unknown as Parameters<typeof getRaceAbilityData>[1],
    )

    expect(data.fixed).toEqual([
      { ability: 'strength', value: 2, source: 'race' },
      { ability: 'intelligence', value: 1, source: 'subrace' },
    ])
    expect(data.choices[0]).toMatchObject({
      count: 2,
      amount: 1,
      from: ['dexterity'],
      source: 'race',
    })
    expect(data.choices[1]?.count).toBe(1)
    expect(data.choices[1]?.source).toBe('subrace')
  })

  test('getRaceAbilityData synthesizes lineage ASI blocks from selected mode', () => {
    const lineageRace = {
      lineage: 'VRGR',
      ability: [] as TestRaceAbilityEntry[],
    } as unknown as Parameters<typeof getRaceAbilityData>[0]

    const plus2Plus1 = getRaceAbilityData(lineageRace, undefined, 0)
    expect(plus2Plus1.choices).toHaveLength(2)
    expect(plus2Plus1.choices[0]).toMatchObject({ count: 1, amount: 2 })
    expect(plus2Plus1.choices[1]).toMatchObject({ count: 1, amount: 1 })

    const plus1x3 = getRaceAbilityData(lineageRace, undefined, 1)
    expect(plus1x3.choices).toHaveLength(1)
    expect(plus1x3.choices[0]).toMatchObject({ count: 3, amount: 1 })

    const customLineageRace = {
      lineage: true,
      ability: [{ choose: { amount: 2, count: 1, from: ['str'] } }],
    }

    const customLineage2Plus1 = getRaceAbilityData(
      customLineageRace as unknown as Parameters<typeof getRaceAbilityData>[0],
      undefined,
      0,
    )
    expect(customLineage2Plus1.choices).toHaveLength(2)
    expect(customLineage2Plus1.choices[0]).toMatchObject({ amount: 2 })
    expect(customLineage2Plus1.choices[1]).toMatchObject({ amount: 1 })
  })
})
