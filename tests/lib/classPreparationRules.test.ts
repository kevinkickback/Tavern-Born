import { describe, expect, test } from 'vitest'
import {
  CLASS_CASTING_PRODUCERS,
  getClassSpellProfilePolicy,
} from '@/lib/5etools/classCastingRules'
import {
  deriveClassPreparationRule,
  getDeclaredPreparationMinimum,
} from '@/lib/5etools/classPreparationStructure'
import { getClassPreparationLimit } from '@/lib/calculations/preparedSpellLimits'

const clause =
  'You prepare the list of spells, choosing a number of spells equal to your ability modifier + your class level (minimum of one spell).'
const formula = {
  name: 'A newly added class',
  source: 'NEW',
  spellcastingAbility: 'wis',
  preparedSpells: '<$level$> + <$wis_mod$>',
  preparedSpellsChange: 'restLong',
}
const table = Array.from({ length: 20 }, (_, index) => index + 1)

describe('source-derived preparation meaning', () => {
  test('supported formula and changed data derive without an owner-name branch', () => {
    const rule = deriveClassPreparationRule(formula, getDeclaredPreparationMinimum([clause]))!
    expect(rule.mode).toBe('daily')
    expect(rule.maximumByLevel).toEqual(Array.from({ length: 20 }, (_, index) => index + 11))
    expect(getClassPreparationLimit(rule, 1, -5)).toBe(1)
    expect(getClassPreparationLimit(rule, 5, 3)).toBe(8)
    expect(
      deriveClassPreparationRule({ ...formula, name: 'Different', source: 'OTHER' }, 1),
    ).toEqual(rule)
    const changed = deriveClassPreparationRule(
      { ...formula, preparedSpells: '<$level$> / 2 + <$wis_mod$>' },
      1,
    )!
    expect(changed.maximumByLevel[19]).toBe(20)
    expect(getClassPreparationLimit(changed, 3, 0)).toBe(1)
    expect(deriveClassPreparationRule({ ...formula, preparedSpells: undefined }, 1)).toBeUndefined()
    expect(deriveClassPreparationRule(formula, 1)).toEqual(rule)
  })

  test('bounds enumerate legal negative modifiers instead of assuming monotonic formulas', () => {
    const rule = deriveClassPreparationRule(
      { ...formula, preparedSpells: '<$level$> - <$wis_mod$>' },
      1,
    )!
    expect(rule.maximumByLevel[0]).toBe(6)
    expect(rule.maximumByLevel[19]).toBe(25)
    expect(getClassPreparationLimit(rule, 1, -5)).toBe(6)
  })

  test('tables preserve daily, learned-book and level-only meaning, including decreasing capacity', () => {
    const data = { spellcastingAbility: 'int', preparedSpellsProgression: table }
    const daily = deriveClassPreparationRule({ ...data, preparedSpellsChange: 'restLong' })!
    expect(daily.mode).toBe('daily')
    expect(daily.maximumByLevel).toEqual(table)
    expect(deriveClassPreparationRule({ ...data, preparedSpellsChange: 'level' })?.mode).toBe(
      'level',
    )
    expect(
      deriveClassPreparationRule({
        ...data,
        preparedSpellsChange: 'restLong',
        spellsKnownProgressionFixed: [6, ...Array(19).fill(2)],
      })?.mode,
    ).toBe('spellbook')
    const shrinking = [...table]
    shrinking[9] = 2
    expect(
      getClassPreparationLimit(
        deriveClassPreparationRule({
          ...data,
          preparedSpellsChange: 'restLong',
          preparedSpellsProgression: shrinking,
        }),
        10,
        5,
      ),
    ).toBe(2)
  })

  test.each([
    { ...formula, spellcastingAbility: 'choose' },
    { spellcastingAbility: 'wis' },
    { ...formula, preparedSpellsChange: 'restShort' },
    { ...formula, preparedSpellsProgression: table },
    { ...formula, spellsKnownProgression: table },
    { ...formula, preparedSpells: '<$level$> + <$int_mod$>' },
    { ...formula, preparedSpells: '<$unknown$>' },
    { ...formula, preparedSpells: '1 / 0' },
    { ...formula, preparedSpells: 'globalThis.attack()' },
    { ...formula, preparedSpells: null },
    { ...formula, preparedSpells: undefined, preparedSpellsProgression: [1, 2] },
    { ...formula, preparedSpells: undefined, preparedSpellsProgression: table.map(() => 1.5) },
    { ...formula, preparedSpells: undefined, preparedSpellsProgression: table.map(() => -1) },
    { ...formula, preparedSpells: undefined, preparedSpellsProgression: table.map(() => Infinity) },
  ])('unsupported or conflicting shape has no preparation descriptor: %j', (data) => {
    expect(deriveClassPreparationRule(data, 1)).toBeUndefined()
  })

  test('minimum grammar requires one complete preparation clause in the exact entries', () => {
    expect(getDeclaredPreparationMinimum([{ entries: [clause] }])).toBe(1)
    for (const entries of [
      [],
      [clause, clause],
      [clause.replace('one spell', 'two spells')],
      [clause.replace('(minimum of one spell)', '')],
      ['You prepare the list of spells equal to your level.', '(minimum of one spell)'],
      ['You can use this bonus a minimum of one time.'],
      ['You prepare a bonus equal to +1 (minimum of one).'],
      [
        'Choose a number of spells equal to your ability modifier (minimum of one spell). You learn these spells permanently.',
      ],
      [{ unrelatedFeature: { entries: [clause] } }],
    ])
      expect(getDeclaredPreparationMinimum(entries)).toBeUndefined()
    expect(deriveClassPreparationRule(formula)).toBeUndefined()
  })

  test('current registered daily and book capacities match their actual source families', () => {
    const daily = CLASS_CASTING_PRODUCERS.filter((row) => row.preparation?.mode === 'daily')
    expect(daily.map((row) => row.declaration.owner).sort()).toEqual(
      [
        ['class', 'artificer', 'efa'],
        ['class', 'artificer', 'tce'],
        ['class', 'cleric', 'phb'],
        ['class', 'cleric', 'xphb'],
        ['class', 'druid', 'phb'],
        ['class', 'druid', 'xphb'],
        ['class', 'paladin', 'phb'],
        ['class', 'paladin', 'xphb'],
        ['class', 'ranger', 'xphb'],
      ].sort(),
    )
    for (const [name, source, mode, maximum] of [
      ['Artificer', 'TCE', 'daily', 20],
      ['Artificer', 'EFA', 'daily', 15],
      ['Cleric', 'PHB', 'daily', 30],
      ['Cleric', 'XPHB', 'daily', 22],
      ['Druid', 'PHB', 'daily', 30],
      ['Druid', 'XPHB', 'daily', 22],
      ['Paladin', 'PHB', 'daily', 20],
      ['Paladin', 'XPHB', 'daily', 15],
      ['Ranger', 'XPHB', 'daily', 15],
      ['Wizard', 'PHB', 'spellbook', 30],
      ['Wizard', 'XPHB', 'spellbook', 25],
    ] as const) {
      const policy = getClassSpellProfilePolicy({ name, source, levels: 20 })
      expect(policy.mode).toBe(mode)
      expect(policy.rule?.preparation?.maximumByLevel[19]).toBe(maximum)
    }
    expect(getClassSpellProfilePolicy({ name: 'Bard', source: 'PHB', levels: 1 }).mode).toBe(
      'known',
    )
    expect(getClassSpellProfilePolicy({ name: 'Bard', source: 'XPHB', levels: 1 }).mode).toBe(
      'known',
    )
    expect(getClassPreparationLimit(undefined, 1, 1)).toBeNull()
    const rule = daily[0].preparation!
    expect(getClassPreparationLimit(rule, 0, 1)).toBeNull()
    expect(getClassPreparationLimit(rule, 21, 1)).toBeNull()
  })
})
