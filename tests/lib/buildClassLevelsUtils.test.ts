import { describe, expect, test } from 'vitest'
import { computeLevelDisplayData } from '@/pages/build/class/model/levelsUtils'

describe('buildClassLevelsUtils', () => {
  test('computeLevelDisplayData derives level flags, gains, and passive features', () => {
    const levelData = computeLevelDisplayData({
      level: 3,
      subclassLevel: 3,
      subclassFeatureName: 'Arcane Tradition',
      asiLevels: [4, 8],
      spellChoicesByLevel: new Map([[3, { cantrips: 1, spells: 2, maxSpellLevel: 2 }]]),
      optFeatureProgressions: [
        {
          name: 'Maneuver',
          featureType: ['Maneuver'],
          progression: [0, 0, 1],
        },
      ],
      classFeatProgressions: [
        {
          name: 'Fighting Style',
          category: ['Fighting Style'],
          progression: [0, 1, 1],
        },
      ],
      featuresByLevel: new Map([
        [
          3,
          [
            {
              name: 'Arcane Tradition',
              source: 'PHB',
              entries: ['pick subclass'],
            },
            {
              name: 'Spellcasting',
              source: 'PHB',
              entries: ['spells'],
            },
            {
              name: 'Fighting Style',
              source: 'PHB',
              entries: ['style'],
            },
          ],
        ],
      ]),
    })

    expect(levelData.isSubclassLevel).toBe(true)
    expect(levelData.isASILevel).toBe(false)
    expect(levelData.spellGain).toEqual({
      cantrips: 1,
      spells: 2,
      maxSpellLevel: 2,
    })
    expect(levelData.optFeatureGainsAtLevel).toHaveLength(1)
    expect(levelData.classFeatGainsAtLevel).toHaveLength(0)
    expect(levelData.passiveFeatures.map((f) => f.name)).toEqual(['Spellcasting', 'Fighting Style'])
    expect(levelData.choiceCount).toBe(3)
    expect(levelData.totalCount).toBe(5)
  })
})
