import { describe, expect, test } from 'vitest'
import { getVariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

function makeSubclassClass(
  className: string,
  subclassName: string,
  subclassSource: string,
): Class5e {
  return makeClassFixture({
    name: className,
    source: 'PHB',
    subclasses: [
      {
        name: subclassName,
        shortName: subclassName,
        source: subclassSource,
        className,
        classSource: 'PHB',
      },
    ],
  })
}

describe('variant rule content availability', () => {
  test('marks content-specific rules unavailable when their records are absent', () => {
    expect(
      getVariantRuleContentAvailability({
        classes: [makeClassFixture()],
        classFeatures: [],
        optionalFeatures: [],
      }),
    ).toEqual({
      optionalClassFeatures: false,
      anyRaceSubclasses: false,
      preferNewerPrintings: false,
    })
  })

  test('detects class feature variants and exact restricted subclasses', () => {
    const classFeatureVariant: ClassFeature = {
      name: 'Cantrip Formulas',
      source: 'TCE',
      isClassFeatureVariant: true,
    }

    expect(
      getVariantRuleContentAvailability({
        classes: [
          makeSubclassClass('Wizard', 'Bladesinger', 'SCAG'),
          makeSubclassClass('Barbarian', 'Battlerager', 'SCAG'),
        ],
        classFeatures: [classFeatureVariant],
        optionalFeatures: [],
        preferNewerPrintingsAvailable: true,
      }),
    ).toEqual({
      optionalClassFeatures: true,
      anyRaceSubclasses: true,
      preferNewerPrintings: true,
    })
  })

  test('detects a normalized variant that exists only on a subclass', () => {
    const classData = makeClassFixture({
      subclasses: [
        {
          name: 'Beast Master',
          shortName: 'Beast Master',
          source: 'PHB',
          className: 'Ranger',
          classSource: 'PHB',
          normalizedRules: {
            resources: [],
            asiLevels: [],
            ritualCasting: false,
            choices: [
              {
                id: 'primal-companion',
                label: 'Primal Companion',
                kind: 'creature',
                owner: {
                  type: 'subclass',
                  name: 'Ranger',
                  source: 'PHB',
                  subclassName: 'Beast Master',
                  subclassSource: 'PHB',
                  featureName: 'Primal Companion',
                },
                level: 3,
                minimumSelections: 1,
                maximumSelections: 1,
                selectionCountByLevel: Array(20).fill(1),
                options: [],
                repeatable: false,
                replacement: { cadence: 'never' },
                source: { kind: 'class-feature-options', field: 'fixture' },
                featureVariant: { replacesFeatureName: "Ranger's Companion" },
              },
            ],
            choiceDiagnostics: [],
          },
        },
      ],
    })

    expect(
      getVariantRuleContentAvailability({
        classes: [classData],
        classFeatures: [],
        optionalFeatures: [],
      }).optionalClassFeatures,
    ).toBe(true)
  })

  test('does not activate a restriction for a similarly named homebrew subclass', () => {
    expect(
      getVariantRuleContentAvailability({
        classes: [makeSubclassClass('Wizard', 'Bladesinger', 'HB')],
        classFeatures: [],
        optionalFeatures: [],
      }).anyRaceSubclasses,
    ).toBe(false)
  })

  test('recognizes a legacy restriction attached to a 2024 parent class', () => {
    const battlerager = makeSubclassClass('Barbarian', 'Battlerager', 'SCAG')
    battlerager.source = 'XPHB'
    if (battlerager.subclasses?.[0]) battlerager.subclasses[0].classSource = 'XPHB'

    expect(
      getVariantRuleContentAvailability({
        classes: [battlerager],
        classFeatures: [],
        optionalFeatures: [],
      }).anyRaceSubclasses,
    ).toBe(true)
  })
})
