import { describe, expect, test, vi } from 'vitest'
import {
  casterProgressionToFull,
  getCasterLevelContribution,
  getEffectiveCasterProgression,
  getEffectiveSpellcastingAbility,
  getMaxSpellLevelForClassLevel,
  getSpellSlotsFromClassData,
  getStandardSpellSlotsFromClassData,
  mergeSpellSlots,
  validateParsedSpellSlotProgressions,
} from '@/lib/calculations/spellSlots'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

describe('spellSlots', () => {
  test('getStandardSpellSlotsFromClassData selects rows by ruleset', () => {
    const phbRows = Array.from({ length: 20 }, () => [2])
    const xphbRows = Array.from({ length: 20 }, () => [2])
    phbRows[16] = [4, 3, 3, 3, 3, 1, 1, 1, 1]
    xphbRows[16] = [4, 3, 3, 3, 2, 1, 1, 1, 1]
    const classes = [
      makeClassFixture({ source: 'PHB', classTableGroups: [{ rowsSpellProgression: phbRows }] }),
      makeClassFixture({ source: 'XPHB', classTableGroups: [{ rowsSpellProgression: xphbRows }] }),
    ]

    expect(getStandardSpellSlotsFromClassData(classes, 17, '2014')?.[5]?.max).toBe(3)
    expect(getStandardSpellSlotsFromClassData(classes, 17, '2024')?.[5]?.max).toBe(2)
    expect(getStandardSpellSlotsFromClassData([], 17, '2024')).toBeNull()
  })

  test('validateParsedSpellSlotProgressions uses source-qualified diagnostics', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    validateParsedSpellSlotProgressions([
      makeClassFixture({ source: 'PHB', classTableGroups: [] }),
      makeClassFixture({
        name: 'Warlock',
        source: 'XPHB',
        casterProgression: 'pact',
        classTableGroups: [],
      }),
    ])

    expect(warn).toHaveBeenCalledWith(
      '[spellSlots] Missing parsed 2014 full-caster progression at level 20 (PHB).',
    )
    expect(warn).toHaveBeenCalledWith(
      '[spellSlots] Missing parsed pact progression for Warlock|XPHB.',
    )
    warn.mockRestore()
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

  test('getMaxSpellLevelForClassLevel prefers parsed tables and does not invent pact slots', () => {
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
    ).toBe(0)
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
