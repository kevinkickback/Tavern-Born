import { describe, expect, test } from 'vitest'
import {
  getClassSpellReplacementLevelLimit,
  getClassSpellSchoolGuidance,
  getClassSpellSchoolRule,
  getReplaceableClassSpellNames,
} from '@/lib/calculations/classSpellChoiceRules'
import { emptyProvenance } from '@/store/characterStore'

describe('class spell-school guidance', () => {
  test('describes initial and later Arcane Trickster allowances', () => {
    const rule = getClassSpellSchoolRule({
      originSystem: '2014',
      className: 'Rogue',
      classSource: 'PHB',
      subclassName: 'Arcane Trickster',
      subclassSource: 'PHB',
    })

    expect(getClassSpellSchoolGuidance(rule, 3, 1)).toBe(
      'At least 2 of your 3 spells must be Enchantment or Illusion spells. The remaining spell may be from any Wizard school.',
    )
    expect(getClassSpellSchoolGuidance(rule, 1, 0)).toBe(
      'This spell must be an Enchantment or Illusion spell.',
    )
    expect(getClassSpellSchoolGuidance(rule, 1, 1)).toBe(
      'This spell may be from any Wizard school.',
    )
  })

  test('uses the Eldritch Knight schools', () => {
    const rule = getClassSpellSchoolRule({
      originSystem: '2014',
      className: 'Fighter',
      classSource: 'PHB',
      subclassName: 'Eldritch Knight',
      subclassSource: 'PHB',
    })

    expect(getClassSpellSchoolGuidance(rule, 3, 1)).toBe(
      'At least 2 of your 3 spells must be Abjuration or Evocation spells. The remaining spell may be from any Wizard school.',
    )
  })
})

describe('class spell replacement candidates', () => {
  test('includes non-fixed profile spells and excludes unowned fixed grants', () => {
    const profile = {
      id: 'class:Warlock|PHB',
      type: 'class' as const,
      label: 'Warlock (Lv 3)',
      className: 'Warlock',
      classSource: 'PHB',
      cantrips: [],
      spellsKnown: ['Hex', 'Armor of Agathys'],
      preparedSpells: [],
      fixedSpells: ['Armor of Agathys'],
      alwaysPrepared: false,
    }

    expect(getReplaceableClassSpellNames(profile, emptyProvenance(), 'Warlock', 'PHB')).toEqual([
      'Hex',
    ])
  })

  test('falls back to the highest resolved replaceable spell level', () => {
    const alarm = {
      name: 'Alarm',
      source: 'PHB',
      level: 1,
      school: 'A',
      time: [{ number: 1, unit: 'minute' }],
      range: { type: 'point', distance: { type: 'feet', amount: 30 } },
      duration: [{ type: 'timed', duration: { type: 'hour', amount: 8 } }],
      entries: [],
    }

    expect(
      getClassSpellReplacementLevelLimit(0, ['Alarm|PHB'], new Map([['alarm|phb', alarm]])),
    ).toBe(1)
    expect(
      getClassSpellReplacementLevelLimit(2, ['Alarm|PHB'], new Map([['alarm|phb', alarm]])),
    ).toBe(2)
  })
})
