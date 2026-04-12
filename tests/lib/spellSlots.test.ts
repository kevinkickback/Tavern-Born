import { describe, expect, test } from 'vitest'
import {
  calculateSpellSlots,
  casterProgressionToFull,
  getCasterLevelContribution,
  getEffectiveCasterProgression,
  getEffectiveSpellcastingAbility,
  getMaxSpellLevelForClassLevel,
  getPactMagicSlots,
  getSpellSlotsFromClassData,
  getStandardSpellSlots,
  isSpellcaster,
  mergeSpellSlots,
} from '@/lib/calculations/spellSlots'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

describe('spellSlots', () => {
  test('getStandardSpellSlots returns expected row for caster levels', () => {
    expect(getStandardSpellSlots(1)).toEqual({
      1: { max: 2, used: 0 },
    })

    expect(getStandardSpellSlots(20)[9]).toEqual({ max: 1, used: 0 })
  })

  test('getPactMagicSlots returns pact slot level and count', () => {
    expect(getPactMagicSlots(1)).toEqual({
      1: { max: 1, used: 0, isPactMagic: true },
    })

    expect(getPactMagicSlots(11)).toEqual({
      5: { max: 3, used: 0, isPactMagic: true },
    })
  })

  test('calculateSpellSlots handles full, half, artificer, pact, and non-caster progressions', () => {
    expect(calculateSpellSlots('Wizard', 5, 'full')[3]).toEqual({
      max: 2,
      used: 0,
    })
    expect(calculateSpellSlots('Paladin', 5, '1/2')[1]).toEqual({
      max: 3,
      used: 0,
    })
    expect(calculateSpellSlots('Artificer', 5, 'artificer')[2]).toEqual({
      max: 2,
      used: 0,
    })
    expect(calculateSpellSlots('Warlock', 5, 'pact')).toEqual({
      3: { max: 2, used: 0, isPactMagic: true },
    })
    expect(calculateSpellSlots('Fighter', 5, 'none')).toEqual({})
  })

  test('getCasterLevelContribution applies progression math consistently', () => {
    expect(getCasterLevelContribution('full', 5)).toBe(5)
    expect(getCasterLevelContribution('1/2', 5)).toBe(2)
    expect(getCasterLevelContribution('1/3', 9)).toBe(3)
    expect(getCasterLevelContribution('artificer', 5)).toBe(3)
    expect(getCasterLevelContribution('pact', 5)).toBe(0)
    expect(getCasterLevelContribution('none', 10)).toBe(0)
  })

  test('effective subclass spellcasting helpers honor subclass values on non-caster classes', () => {
    const fighter = makeClassFixture({
      name: 'Fighter',
      casterProgression: 'none',
    })
    const eldritchKnight = {
      name: 'Eldritch Knight',
      shortName: 'Eldritch Knight',
      source: 'PHB',
      className: 'Fighter',
      spellcastingAbility: 'int',
      casterProgression: '1/3',
    }

    expect(getEffectiveCasterProgression(fighter, eldritchKnight)).toBe('1/3')
    expect(getEffectiveSpellcastingAbility(fighter, eldritchKnight)).toBe('int')
  })

  test('isSpellcaster uses supplied progression first, then fallback table', () => {
    expect(isSpellcaster('Fighter')).toBe(false)
    expect(isSpellcaster('Wizard')).toBe(true)
    expect(isSpellcaster('UnknownClass', 'full')).toBe(true)
  })

  test('getSpellSlotsFromClassData reads rowsSpellProgression', () => {
    const wizard = makeClassFixture({
      classTableGroups: [
        {
          rowsSpellProgression: [[2], [3], [4, 2]],
        },
      ],
    })

    expect(getSpellSlotsFromClassData(wizard, 3)).toEqual({
      1: { max: 4, used: 0 },
      2: { max: 2, used: 0 },
    })
  })

  test('getSpellSlotsFromClassData parses pact slot rows from class tables', () => {
    const warlock = makeClassFixture({
      name: 'Warlock',
      casterProgression: 'pact',
      classTableGroups: [
        {
          colLabels: ['Cantrips Known', 'Spells Known', 'Spell Slots', 'Slot Level'],
          rows: [
            [2, 2, 1, 1],
            [2, 3, 2, 1],
            [2, 4, 2, 2],
          ],
        },
      ],
    })

    expect(getSpellSlotsFromClassData(warlock, 3)).toEqual({
      2: { max: 2, used: 0, isPactMagic: true },
    })
  })

  test('getSpellSlotsFromClassData returns null without progression table', () => {
    const fighter = makeClassFixture({
      name: 'Fighter',
      classTableGroups: [],
    })

    expect(getSpellSlotsFromClassData(fighter, 1)).toBeNull()
  })

  test('getMaxSpellLevelForClassLevel prefers parsed tables and handles pact fallback', () => {
    const wizard = makeClassFixture({
      classTableGroups: [
        {
          rowsSpellProgression: [[2], [3], [4, 2]],
        },
      ],
    })

    expect(getMaxSpellLevelForClassLevel(wizard, 3)).toBe(2)
    expect(
      getMaxSpellLevelForClassLevel(
        makeClassFixture({
          name: 'Warlock',
          casterProgression: 'pact',
          classTableGroups: [],
        }),
        5,
      ),
    ).toBe(3)
  })

  test('getMaxSpellLevelForClassLevel uses parsed pact slot level when available', () => {
    const warlock = makeClassFixture({
      name: 'Warlock',
      casterProgression: 'pact',
      classTableGroups: [
        {
          colLabels: ['Cantrips Known', 'Spells Known', 'Spell Slots', 'Slot Level'],
          rows: [
            [2, 2, 1, 1],
            [2, 3, 2, 1],
            [2, 4, 2, 2],
            [3, 5, 2, 2],
            [3, 6, 2, 3],
          ],
        },
      ],
    })

    expect(getMaxSpellLevelForClassLevel(warlock, 5)).toBe(3)
  })

  test('mergeSpellSlots preserves and clamps used counts', () => {
    const calculated = {
      1: { max: 4, used: 0 },
      2: { max: 2, used: 0 },
    }

    const merged = mergeSpellSlots(calculated, {
      1: 3,
      2: 5,
      3: 1,
    })

    expect(merged).toEqual({
      1: { max: 4, used: 3 },
      2: { max: 2, used: 2 },
    })
  })
})

describe('casterProgressionToFull', () => {
  test('maps canonical caster progression keys to display names', () => {
    expect(casterProgressionToFull('full')).toBe('Full')
    expect(casterProgressionToFull('1/2')).toBe('Half')
    expect(casterProgressionToFull('1/3')).toBe('One-Third')
    expect(casterProgressionToFull('pact')).toBe('Pact Magic')
    expect(casterProgressionToFull('artificer')).toBe('Artificer')
    expect(casterProgressionToFull('none')).toBe('None')
  })

  test('passes unknown keys through unchanged', () => {
    expect(casterProgressionToFull('unknown')).toBe('unknown')
  })
})
