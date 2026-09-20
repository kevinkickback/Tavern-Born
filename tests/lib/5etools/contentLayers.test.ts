import { describe, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { makeClassFixture, makeGameDataFixture } from '../../fixtures/gameDataFixtures'

describe('game-data content layers', () => {
  test('keeps omitted SRD entities while additional content replaces exact identities', () => {
    const srdWizard = makeClassFixture({ name: 'Wizard', source: 'PHB', page: 1 })
    const srdFighter = makeClassFixture({ name: 'Fighter', source: 'PHB', page: 2 })
    const richerWizard = makeClassFixture({ name: 'Wizard', source: 'PHB', page: 99 })
    const artificer = makeClassFixture({ name: 'Artificer', source: 'TCE', page: 9 })

    const composed = composeGameDataLayers([
      makeGameDataFixture({
        classes: [srdWizard, srdFighter],
        sources: [
          { abbreviation: 'PHB', name: "Player's Handbook", group: 'Core' },
          { abbreviation: 'XPHB', name: "Player's Handbook (2024)", group: 'Core' },
        ],
      }),
      makeGameDataFixture({
        classes: [richerWizard, artificer],
        sources: [
          { abbreviation: 'PHB', name: "Player's Handbook", group: 'Core Books' },
          { abbreviation: 'TCE', name: "Tasha's Cauldron of Everything", group: 'Supplements' },
        ],
      }),
    ])

    expect(composed.classes).toEqual([richerWizard, srdFighter, artificer])
    expect(composed.sources.map((source) => source.abbreviation)).toEqual(['PHB', 'XPHB', 'TCE'])
    expect(composed.sources[0].group).toBe('Core Books')
    expect(composed.lookups?.classesByKey['Wizard|PHB']).toBe(richerWizard)
    expect(composed.lookups?.classesByKey['Fighter|PHB']).toBe(srdFighter)
  })

  test('uses the full parent and level identity for class features', () => {
    const levelFour = {
      name: 'Ability Score Improvement',
      source: 'PHB',
      className: 'Fighter',
      classSource: 'PHB',
      level: 4,
      entries: ['base level four'],
    }
    const levelSix = {
      ...levelFour,
      level: 6,
      entries: ['base level six'],
    }
    const richerLevelFour = {
      ...levelFour,
      entries: ['additional level four'],
    }

    const composed = composeGameDataLayers([
      makeGameDataFixture({ classFeatures: [levelFour, levelSix] }),
      makeGameDataFixture({ classFeatures: [richerLevelFour] }),
    ])

    expect(composed.classFeatures).toEqual([richerLevelFour, levelSix])
  })

  test('resolves class feature references against the completed layered catalog', () => {
    const sharedFeature = {
      name: 'Shared Foundation',
      source: 'PHB',
      className: 'Inventor',
      classSource: 'TEST',
      level: 1,
      entries: ['Provided by the base layer.'],
    }
    const inventor = makeClassFixture({
      name: 'Inventor',
      source: 'TEST',
      classFeatureRefs: [
        {
          ref: 'Shared Foundation|Inventor|TEST|1|PHB',
          name: 'Shared Foundation',
          source: 'PHB',
          className: 'Inventor',
          classSource: 'TEST',
          level: 1,
        },
      ],
    })

    const composed = composeGameDataLayers([
      makeGameDataFixture({ classFeatures: [sharedFeature] }),
      makeGameDataFixture({ classes: [inventor] }),
    ])

    expect(composed.classes[0].classFeatureRefs?.[0].feature).toBe(sharedFeature)
  })

  test('relinks base class references when an additional layer replaces the feature', () => {
    const baseFeature = {
      name: 'Shared Foundation',
      source: 'PHB',
      className: 'Inventor',
      classSource: 'TEST',
      level: 1,
      entries: ['Base rules.'],
    }
    const additionalFeature = {
      ...baseFeature,
      entries: ['Expanded rules.'],
    }
    const inventor = makeClassFixture({
      name: 'Inventor',
      source: 'TEST',
      classFeatureRefs: [
        {
          ref: 'Shared Foundation|Inventor|TEST|1|PHB',
          name: 'Shared Foundation',
          source: 'PHB',
          className: 'Inventor',
          classSource: 'TEST',
          level: 1,
          feature: baseFeature,
        },
      ],
    })

    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [inventor], classFeatures: [baseFeature] }),
      makeGameDataFixture({ classFeatures: [additionalFeature] }),
    ])

    expect(composed.classes[0].classFeatureRefs?.[0].feature).toBe(additionalFeature)
  })
})
