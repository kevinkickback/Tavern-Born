import { describe, expect, test } from 'vitest'
import { composeGameDataLayers, findLayerDependencyIssues } from '@/lib/5etools/contentLayers'
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

  test('resolves subclass feature references across layers and rebuilds level groups', () => {
    const sharedFeature = {
      name: 'Inventive Method',
      source: 'TEST',
      className: 'Inventor',
      classSource: 'TEST',
      subclassShortName: 'Smith',
      subclassSource: 'TEST',
      level: 3,
      entries: ['Provided by the base layer.'],
    }
    const baseClass = makeClassFixture({
      name: 'Inventor',
      source: 'TEST',
      classFeatureRefs: [],
      subclasses: [
        {
          name: 'The Smith',
          shortName: 'Smith',
          source: 'TEST',
          className: 'Inventor',
          classSource: 'TEST',
          subclassFeatureRefs: [
            {
              ref: 'Inventive Method|Inventor|TEST|Smith|TEST|3|TEST',
              name: 'Inventive Method',
              source: 'TEST',
              className: 'Inventor',
              classSource: 'TEST',
              subclassShortName: 'Smith',
              subclassSource: 'TEST',
              level: 3,
              feature: sharedFeature,
            },
          ],
        },
      ],
    })
    const additionalClass = makeClassFixture({
      name: 'Inventor',
      source: 'TEST',
      classFeatureRefs: [],
      subclasses: [
        {
          name: 'The Smith',
          shortName: 'Smith',
          source: 'TEST',
          className: 'Inventor',
          classSource: 'TEST',
          subclassFeatureRefs: [
            {
              ref: 'Inventive Method|Inventor|TEST|Smith|TEST|3|TEST',
              name: 'Inventive Method',
              source: 'TEST',
              className: 'Inventor',
              classSource: 'TEST',
              subclassShortName: 'Smith',
              subclassSource: 'TEST',
              level: 3,
            },
          ],
        },
      ],
    })

    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [baseClass] }),
      makeGameDataFixture({ classes: [additionalClass] }),
    ])

    const subclass = composed.classes[0].subclasses?.[0]
    expect(subclass?.subclassFeatureRefs?.[0].feature).toBe(sharedFeature)
    expect(subclass?.levelFeatures).toEqual([{ level: 3, features: [sharedFeature] }])
    expect(
      findLayerDependencyIssues(composed, makeGameDataFixture({ classes: [additionalClass] })),
    ).toEqual([])
  })

  test('reports unresolved hard references introduced by additional classes', () => {
    const additionalClass = makeClassFixture({
      name: 'Inventor',
      source: 'TEST',
      classFeatureRefs: [
        {
          ref: 'Missing Feature|Inventor|TEST|1|TEST',
          name: 'Missing Feature',
          source: 'TEST',
          className: 'Inventor',
          classSource: 'TEST',
          level: 1,
        },
      ],
    })
    const additional = makeGameDataFixture({ classes: [additionalClass] })
    const composed = composeGameDataLayers([makeGameDataFixture(), additional])

    expect(findLayerDependencyIssues(composed, additional)).toEqual([
      {
        owner: 'Inventor|TEST',
        path: 'classFeatureRefs[0]',
        reference: 'Missing Feature|Inventor|TEST|1|TEST',
      },
    ])
  })

  test('reports unresolved subclass features and explicit class-choice options', () => {
    const additionalClass = makeClassFixture({
      name: 'Inventor',
      source: 'TEST',
      classFeatureRefs: [],
      subclasses: [
        {
          name: 'The Smith',
          shortName: 'Smith',
          source: 'TEST',
          className: 'Inventor',
          classSource: 'TEST',
          subclassFeatureRefs: [
            {
              ref: 'Missing Method|Inventor|TEST|Smith|TEST|3|TEST',
              name: 'Missing Method',
              source: 'TEST',
              className: 'Inventor',
              classSource: 'TEST',
              subclassShortName: 'Smith',
              subclassSource: 'TEST',
              level: 3,
            },
          ],
        },
      ],
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [
          {
            id: 'inventor-specialty',
            label: 'Inventor Specialty',
            kind: 'feat',
            owner: { type: 'class', name: 'Inventor', source: 'TEST' },
            level: 1,
            minimumSelections: 1,
            maximumSelections: 1,
            selectionCountByLevel: [1],
            options: [{ entityType: 'feat', name: 'Missing Specialty', source: 'TEST' }],
            repeatable: false,
            replacement: { cadence: 'never' },
            source: { kind: 'class-feature-options', field: 'test.options' },
          },
        ],
        choiceDiagnostics: [],
      },
    })
    const additional = makeGameDataFixture({ classes: [additionalClass] })
    const composed = composeGameDataLayers([makeGameDataFixture(), additional])

    expect(findLayerDependencyIssues(composed, additional)).toEqual([
      {
        owner: 'Inventor|TEST/The Smith|TEST',
        path: 'subclasses[0].subclassFeatureRefs[0]',
        reference: 'Missing Method|Inventor|TEST|Smith|TEST|3|TEST',
      },
      {
        owner: 'Inventor|TEST',
        path: 'normalizedRules.choices[0].options[0]',
        reference: 'Missing Specialty|TEST',
      },
    ])
  })

  test('resolves nested subclass-choice features in dependency audits', () => {
    const bear = {
      name: 'Bear',
      source: 'PHB',
      className: 'Barbarian',
      classSource: 'PHB',
      subclassShortName: 'Totem Warrior',
      subclassSource: 'PHB',
      level: 3,
      entries: ['Bear option rules.'],
    }
    const totemSpirit = {
      name: 'Totem Spirit',
      source: 'PHB',
      className: 'Barbarian',
      classSource: 'PHB',
      subclassShortName: 'Totem Warrior',
      subclassSource: 'PHB',
      level: 3,
      entries: [{ type: 'refSubclassFeature', feature: bear }],
    }
    const barbarian = makeClassFixture({
      name: 'Barbarian',
      source: 'PHB',
      classFeatureRefs: [],
      subclasses: [
        {
          name: 'Path of the Totem Warrior',
          shortName: 'Totem Warrior',
          source: 'PHB',
          className: 'Barbarian',
          classSource: 'PHB',
          subclassFeatureRefs: [
            {
              ref: 'Totem Spirit|Barbarian||Totem Warrior||3',
              name: 'Totem Spirit',
              source: 'PHB',
              className: 'Barbarian',
              classSource: 'PHB',
              subclassShortName: 'Totem Warrior',
              subclassSource: 'PHB',
              level: 3,
              feature: totemSpirit,
            },
          ],
          normalizedRules: {
            resources: [],
            asiLevels: [],
            ritualCasting: false,
            choices: [
              {
                id: 'totem-spirit',
                label: 'Totem Spirit',
                kind: 'subclass-feature',
                owner: {
                  type: 'subclass',
                  name: 'Barbarian',
                  source: 'PHB',
                  subclassName: 'Path of the Totem Warrior',
                  subclassSource: 'PHB',
                },
                level: 3,
                minimumSelections: 1,
                maximumSelections: 1,
                selectionCountByLevel: [0, 0, 1],
                options: [{ entityType: 'subclassFeature', name: 'Bear', source: 'PHB' }],
                repeatable: false,
                replacement: { cadence: 'never' },
                source: { kind: 'class-feature-options', field: 'entries' },
              },
            ],
            choiceDiagnostics: [],
          },
        },
      ],
    })
    const layer = makeGameDataFixture({ classes: [barbarian] })

    expect(findLayerDependencyIssues(layer, layer)).toEqual([])
  })
})
