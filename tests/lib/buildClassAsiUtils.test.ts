import { describe, expect, test } from 'vitest'
import {
  applyClassAsiChoice,
  assignLegacyClassAsiFeats,
  isClassAsiFeatForSlot,
  resetClassAsiChoice,
} from '@/pages/build/class/model/asi'

describe('buildClassAsiUtils', () => {
  test('applyClassAsiChoice applies a new ASI and appends choice', () => {
    const result = applyClassAsiChoice({
      currentAsiChoices: [],
      className: 'Fighter',
      level: 4,
      abilityChanges: { strength: 2 },
    })

    expect(result).toEqual([
      {
        id: 'asi-Fighter-4',
        className: 'Fighter',
        level: 4,
        abilityChanges: { strength: 2 },
      },
    ])
  })

  test('applyClassAsiChoice replaces existing ASI at same class/level', () => {
    const result = applyClassAsiChoice({
      currentAsiChoices: [
        {
          id: 'asi-Fighter-4',
          className: 'Fighter',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
      className: 'Fighter',
      level: 4,
      abilityChanges: { constitution: 2 },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.abilityChanges).toEqual({ constitution: 2 })
  })

  test('resetClassAsiChoice removes the matching ASI choice', () => {
    const result = resetClassAsiChoice({
      currentAsiChoices: [
        {
          id: 'asi-Fighter-4',
          className: 'Fighter',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
      className: 'Fighter',
      level: 4,
    })

    expect(result).not.toBeNull()
    expect(result).toEqual([])
  })

  test('keeps multiclass feat choices scoped to their class and level', () => {
    const artificerFeat = {
      id: 'war-caster-phb',
      name: 'War Caster',
      source: 'PHB',
      description: '',
      className: 'Artificer',
      classSource: 'PHB',
      classLevel: 4,
    }

    expect(isClassAsiFeatForSlot(artificerFeat, 'Artificer', 'PHB', 4)).toBe(true)
    expect(isClassAsiFeatForSlot(artificerFeat, 'Wizard', 'PHB', 4)).toBe(false)
    expect(isClassAsiFeatForSlot(artificerFeat, 'Artificer', 'PHB', 8)).toBe(false)
  })

  test('keeps same-name class ASIs separate by class source', () => {
    const result = applyClassAsiChoice({
      currentAsiChoices: [
        {
          id: 'asi-Wizard-PHB-4',
          className: 'Wizard',
          classSource: 'PHB',
          level: 4,
          abilityChanges: { intelligence: 2 },
        },
      ],
      className: 'Wizard',
      classSource: 'XPHB',
      level: 4,
      abilityChanges: { wisdom: 2 },
    })

    expect(result).toHaveLength(2)
    expect(result.map((choice) => choice.classSource)).toEqual(['PHB', 'XPHB'])
  })

  test('migrates legacy feats into separate multiclass ASI slots', () => {
    const result = assignLegacyClassAsiFeats(
      [
        { id: 'war-caster', name: 'War Caster', source: 'PHB', description: '' },
        { id: 'alert', name: 'Alert', source: 'PHB', description: '' },
      ],
      [
        { className: 'Artificer', classSource: 'PHB', level: 4 },
        { className: 'Wizard', classSource: 'PHB', level: 4 },
      ],
      [],
    )

    expect(result[0]).toMatchObject({
      name: 'War Caster',
      className: 'Artificer',
      classSource: 'PHB',
      classLevel: 4,
    })
    expect(result[1]).toMatchObject({
      name: 'Alert',
      className: 'Wizard',
      classSource: 'PHB',
      classLevel: 4,
    })
  })

  test('legacy feat migration skips slots already resolved with an ASI', () => {
    const [feat] = assignLegacyClassAsiFeats(
      [{ id: 'alert', name: 'Alert', source: 'PHB', description: '' }],
      [
        { className: 'Artificer', classSource: 'PHB', level: 4 },
        { className: 'Wizard', classSource: 'PHB', level: 4 },
      ],
      [
        {
          id: 'asi-Artificer-PHB-4',
          className: 'Artificer',
          classSource: 'PHB',
          level: 4,
          abilityChanges: { intelligence: 2 },
        },
      ],
    )

    expect(feat).toMatchObject({ className: 'Wizard', classLevel: 4 })
  })
})
