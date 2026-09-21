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
      bladesingerAnyRace: false,
      battleragerAnyRace: false,
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
      }),
    ).toEqual({
      optionalClassFeatures: true,
      bladesingerAnyRace: true,
      battleragerAnyRace: true,
    })
  })

  test('does not activate a restriction for a similarly named homebrew subclass', () => {
    expect(
      getVariantRuleContentAvailability({
        classes: [makeSubclassClass('Wizard', 'Bladesinger', 'HB')],
        classFeatures: [],
        optionalFeatures: [],
      }).bladesingerAnyRace,
    ).toBe(false)
  })
})
