import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { composeGameDataLayers, findLayerDependencyIssues } from '@/lib/5etools/contentLayers'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { parseItemProperties } from '@/lib/5etools/parsers/basic'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e } from '@/types/5etools'
import type { NormalizedChoiceOptionReference, NormalizedClassRules } from '@/types/classRules'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../../fixtures/gameDataFixtures'

describe('game-data content layers', () => {
  test.each([
    ['classFeature', 'class'],
    ['classFeature', 'subclass'],
    ['subclassFeature', 'class'],
    ['subclassFeature', 'subclass'],
  ] as const)('%s dependency audits honor complete UIDs in %s choices', (entityType, ownerType) => {
    const target = {
      name: 'Signal',
      source: '',
      className: 'Wizard',
      classSource: 'PHB',
      level: 3,
      subclassShortName: 'School',
      subclassSource: 'PHB',
      entries: ['As an action, send a signal.'],
    }
    const ref = entityType === 'classFeature' ? 'Signal|Wizard||3' : 'Signal|Wizard||School||3'
    const option: NormalizedChoiceOptionReference = { entityType, name: 'Signal', ref }
    const emptyRules: NormalizedClassRules = {
      resources: [],
      asiLevels: [],
      ritualCasting: false,
      choices: [],
      choiceDiagnostics: [],
    }
    const rules: NormalizedClassRules = {
      ...emptyRules,
      choices: [
        {
          id: 'signal-choice',
          label: 'Signal choice',
          kind: entityType === 'classFeature' ? 'class-feature' : 'subclass-feature',
          owner: { type: 'class', name: 'Wizard', source: 'PHB' },
          level: 3,
          minimumSelections: 1,
          maximumSelections: 1,
          selectionCountByLevel: [0, 0, 1],
          options: [option],
          repeatable: false,
          replacement: { cadence: 'never' },
          source: { kind: 'class-feature-options', field: 'entries' },
        },
      ],
    }
    if (ownerType === 'subclass') {
      rules.choices[0].owner = {
        ...rules.choices[0].owner,
        type: 'subclass',
        subclassName: 'School of Signals',
        subclassSource: 'PHB',
      }
    }
    const classData = makeClassFixture({
      classFeatures: [],
      classFeatureRefs: [],
      normalizedRules: ownerType === 'class' ? rules : emptyRules,
      subclasses: [
        {
          name: 'School of Signals',
          shortName: 'School',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          subclassFeatures: entityType === 'subclassFeature' ? [target] : [],
          normalizedRules: ownerType === 'subclass' ? rules : emptyRules,
        },
      ],
    })
    const data = makeGameDataFixture({
      classes: [classData],
      classFeatures: entityType === 'classFeature' ? [target] : [],
    })
    const audit = (reference: NormalizedChoiceOptionReference, available = data) => {
      rules.choices[0].options = [reference]
      const before = structuredClone(available)
      const result = {
        dependencies: findLayerDependencyIssues(available, data),
        capabilities: createCorpusCapabilityReport(available).issues,
      }
      expect(available).toEqual(before)
      return result
    }
    for (const source of [undefined, '', '  ', 'PHB', 'phb', ' PHB ']) {
      expect(audit({ ...option, source })).toEqual({ dependencies: [], capabilities: [] })
    }
    for (const invalid of [
      { ...option, source: 'TCE' },
      { ...option, name: 'Other target' },
      { ...option, ref: `${ref}junk` },
      { ...option, ref: undefined },
    ]) {
      const result = audit(invalid)
      expect(result.dependencies).toHaveLength(1)
      expect(result.capabilities).toMatchObject([{ code: 'unresolved-reference' }])
    }
    rules.choices[0].options = [option]
    const missing = structuredClone(data)
    missing.classFeatures = []
    missing.classes[0].subclasses![0].subclassFeatures = []
    const missingResult = audit(option, missing)
    expect(missingResult.dependencies).toHaveLength(1)
    expect(missingResult.capabilities).toMatchObject([{ code: 'unresolved-reference' }])
    expect(audit(option)).toEqual({ dependencies: [], capabilities: [] })
  })

  test('non-feature choice audits still require an explicit printing', () => {
    const classData = makeClassFixture({
      classFeatures: [],
      classFeatureRefs: [],
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [
          {
            id: 'feat-choice',
            label: 'Feat choice',
            kind: 'feat',
            owner: { type: 'class', name: 'Wizard', source: 'PHB' },
            level: 1,
            minimumSelections: 1,
            maximumSelections: 1,
            selectionCountByLevel: [1],
            options: [{ entityType: 'feat', name: 'Signal Feat', source: 'PHB' }],
            repeatable: false,
            replacement: { cadence: 'never' },
            source: { kind: 'class-feature-options', field: 'entries' },
          },
        ],
        choiceDiagnostics: [],
      },
    })
    const data = makeGameDataFixture({
      classes: [classData],
      feats: [{ name: 'Signal Feat', source: 'PHB' }],
    })
    expect(findLayerDependencyIssues(data, data)).toEqual([])
    expect(createCorpusCapabilityReport(data).issues).toEqual([])
    for (const source of [undefined, '', '  ']) {
      classData.normalizedRules!.choices[0].options[0].source = source
      expect(findLayerDependencyIssues(data, data)).toHaveLength(1)
      expect(createCorpusCapabilityReport(data).issues).toMatchObject([
        { code: 'unqualified-reference' },
      ])
    }
  })

  test('resolves an added copied item against its base-layer parent', () => {
    const composed = composeGameDataLayers([
      makeGameDataFixture({
        items: [{ name: 'Base Blade', source: 'PHB', type: 'M', dmg1: '1d8' }],
      }),
      makeGameDataFixture({
        items: [
          {
            name: 'Special Blade',
            source: 'HB',
            type: 'M',
            _copy: {
              name: 'Base Blade',
              source: 'PHB',
            },
          },
        ],
      }),
    ])
    expect(composed.lookups?.itemLookup.get('special blade|hb')).toMatchObject({ dmg1: '1d8' })
  })

  test('rejects unresolved copies after the final layer retry', () => {
    expect(() =>
      composeGameDataLayers([
        makeGameDataFixture({
          items: [
            {
              name: 'Broken Blade',
              source: 'HB',
              type: 'M',
              _copy: { name: 'Missing Blade', source: 'PHB' },
            },
          ],
        }),
      ]),
    ).toThrow(/Unable to resolve 1 copied record after content layering.*Broken Blade\|HB/)
  })

  test('keeps each source-qualified item property when definitions have no top-level name', () => {
    const ammunition = { abbreviation: 'A', source: 'PHB', entries: [{ name: 'Ammunition' }] }
    const heavy = { abbreviation: 'H', source: 'PHB', entries: [{ name: 'Heavy' }] }
    const twoHanded = { abbreviation: '2H', source: 'PHB', entries: [{ name: 'Two-Handed' }] }
    const additionalHeavy = { ...heavy, entries: [{ name: 'Heavy (updated)' }] }

    const composed = composeGameDataLayers([
      makeGameDataFixture({ itemProperties: [ammunition, heavy, twoHanded] }),
      makeGameDataFixture({ itemProperties: [additionalHeavy] }),
    ])

    expect(composed.itemProperties).toEqual([ammunition, additionalHeavy, twoHanded])
    expect(composed.lookups?.itemPropertyByAbbr).toMatchObject({
      A: 'Ammunition',
      H: 'Heavy (updated)',
      '2H': 'Two-Handed',
    })
  })

  test('replaces a named property with an entry-named definition of the same UID', () => {
    const bundled = { abbreviation: 'S', source: 'PHB', name: 'special' }
    const overlay = { abbreviation: 'S', source: 'PHB', entries: [{ name: 'Special updated' }] }
    const composed = composeGameDataLayers([
      makeGameDataFixture({ itemProperties: [bundled] }),
      makeGameDataFixture({ itemProperties: [overlay] }),
    ])

    expect(composed.itemProperties).toEqual([overlay])
    expect(composed.lookups?.itemPropertyByAbbr['S|PHB']).toBe('Special updated')
  })

  test('retains bundled weapon property names after layering', () => {
    const bundledItems = JSON.parse(
      readFileSync(join(process.cwd(), 'resources/srd/core/data/items-base.json'), 'utf8'),
    )
    const composed = composeGameDataLayers([
      makeGameDataFixture({ itemProperties: parseItemProperties(bundledItems) }),
      makeGameDataFixture(),
    ])

    expect(composed.lookups?.itemPropertyByAbbr).toMatchObject({
      A: 'Ammunition',
      H: 'Heavy',
      '2H': 'Two-Handed',
      'S|PHB': 'special',
    })
  })

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

  test.each([
    {
      sourceFields: { source: 'TEST', classSource: 'TEST', subclassSource: 'TEST' },
      target: 'TEST',
      provided: 'TEST',
      restored: true,
    },
    {
      sourceFields: { source: '', classSource: '', subclassSource: '' },
      target: 'PHB',
      provided: 'PHB',
      restored: true,
    },
    { sourceFields: {}, target: 'PHB', provided: 'PHB', restored: true },
    {
      sourceFields: { source: 'TCE', classSource: 'PHB', subclassSource: 'PHB' },
      target: 'PHB',
      provided: 'TCE',
      restored: false,
    },
  ])('restores exact subclass layer identity with sources $sourceFields', ({
    sourceFields,
    target,
    provided,
    restored,
  }) => {
    const ref = ['Smith', 'Inventor', target, 'Smith', target, '3', target].join('|')
    const donorRef = ['Smith', 'Inventor', target, 'Smith', target, '3', provided].join('|')
    const declaration = {
      class: [{ name: 'Inventor', source: 'TEST' }],
      subclass: [
        {
          name: 'The Smith',
          shortName: 'Smith',
          source: 'TEST',
          className: 'Inventor',
          classSource: 'TEST',
          subclassFeatures: [ref],
        },
      ],
    }
    const physicalFeature = {
      name: 'Smith',
      className: 'Inventor',
      subclassShortName: 'Smith',
      level: 3,
      ...sourceFields,
      entries: [
        'As an action, use the method.',
        {
          type: 'options',
          count: 1,
          entries: [{ type: 'refOptionalfeature', optionalfeature: 'Training|PHB' }],
        },
      ],
    }
    const base = makeGameDataFixture({
      classes: parseClasses({
        ...declaration,
        subclass: declaration.subclass.map((subclass) => ({
          ...subclass,
          subclassFeatures: [donorRef],
        })),
        subclassFeature: [physicalFeature],
      }) as Class5e[],
      optionalfeatures: [
        { name: 'Training', source: 'PHB', featureType: ['TEST'], entries: ['Training.'] },
      ],
    })
    const additional = makeGameDataFixture({
      classes: parseClasses({ ...declaration, subclassFeature: [] }) as Class5e[],
    })
    const before = structuredClone([base, additional])
    const sharedFeature = base.classes[0].subclasses![0].subclassFeatureRefs![0].feature
    expect(sharedFeature).toBeDefined()
    const composed = composeGameDataLayers([base, additional])
    const subclass = composed.classes[0].subclasses![0]
    expect(subclass.subclassFeatureRefs![0].ref).toBe(ref)
    expect(subclass.subclassFeatureRefs![0].feature).toBe(restored ? sharedFeature : undefined)
    expect(subclass.entries).toEqual(restored ? physicalFeature.entries : [])
    expect(subclass.levelFeatures).toEqual(
      restored ? [{ level: 3, features: [sharedFeature] }] : [],
    )
    expect(subclass.normalizedRules!.choices).toHaveLength(restored ? 1 : 0)
    expect(findLayerDependencyIssues(composed, additional)).toEqual(
      restored
        ? []
        : [
            {
              owner: 'Inventor|TEST/The Smith|TEST',
              path: 'subclasses[0].subclassFeatureRefs[0]',
              reference: ref,
            },
          ],
    )
    const character = makeCharacterFixture({
      features: [],
      classProgression: [
        {
          name: 'Inventor',
          source: 'TEST',
          levels: 3,
          subclass: 'The Smith',
          subclassSource: 'TEST',
        },
      ],
    })
    expect(
      deriveRulesTextActions(character, undefined, { classes: composed.classes }),
    ).toHaveLength(restored ? 1 : 0)
    expect(
      createCharacterSheetViewModel(character, {
        classesByKey: buildClassLookup(composed.classes),
      }).actions,
    ).toHaveLength(restored ? 1 : 0)
    expect([base, additional]).toEqual(before)

    const replacement = {
      ...physicalFeature,
      entries: ['As an action, use the replacement method.', ...physicalFeature.entries.slice(1)],
    }
    const replacementLayer = makeGameDataFixture({
      classes: parseClasses({
        class: [{ name: 'Archive', source: 'OTHER' }],
        subclass: declaration.subclass.map((value) => ({
          ...value,
          className: 'Archive',
          classSource: 'OTHER',
          subclassFeatures: [donorRef],
        })),
        subclassFeature: [replacement],
      }) as Class5e[],
    })
    const replacementInputs = structuredClone([composed, replacementLayer])
    const replaced = composeGameDataLayers([composed, replacementLayer])
    const replacedSubclass = replaced.classes[0].subclasses![0]
    expect(replacedSubclass.subclassFeatureRefs![0].ref).toBe(ref)
    expect(replacedSubclass.entries).toEqual(restored ? replacement.entries : [])
    expect(replacedSubclass.normalizedRules!.choices).toHaveLength(restored ? 1 : 0)
    expect(
      deriveRulesTextActions(character, undefined, { classes: replaced.classes }),
    ).toMatchObject(
      restored ? [{ description: expect.stringContaining('replacement method') }] : [],
    )
    expect([composed, replacementLayer]).toEqual(replacementInputs)
  })
  test.each([
    { source: 'PHB', valid: true },
    { source: undefined, valid: true },
    { source: null, valid: false },
    { source: 5, valid: false },
    { source: {}, valid: false },
  ])('uses the latest valid layered subclass feature with source $source', ({ source, valid }) => {
    const baseFeature = {
      name: 'Inventive Method',
      source: 'PHB',
      className: 'Inventor',
      classSource: 'TEST',
      subclassShortName: 'Smith',
      subclassSource: 'PHB',
      level: 3,
      entries: ['Base rules.'],
    }
    const additionalFeature = {
      ...baseFeature,
      source: source as string,
      entries: ['Additional rules.'],
    }
    const classWithFeature = (feature: typeof baseFeature) =>
      makeClassFixture({
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
                ref: 'Inventive Method|Inventor|TEST|Smith|PHB|3|PHB',
                name: 'Inventive Method',
                source: 'PHB',
                className: 'Inventor',
                classSource: 'TEST',
                subclassShortName: 'Smith',
                subclassSource: 'PHB',
                level: 3,
                feature,
              },
            ],
          },
        ],
      })

    const composed = composeGameDataLayers([
      makeGameDataFixture({ classes: [classWithFeature(baseFeature)] }),
      makeGameDataFixture({ classes: [classWithFeature(additionalFeature)] }),
    ])

    expect(composed.classes[0].subclasses?.[0].subclassFeatureRefs?.[0].feature).toBe(
      valid ? additionalFeature : baseFeature,
    )
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
                options: [
                  {
                    entityType: 'subclassFeature',
                    name: 'Bear',
                    source: 'PHB',
                    ref: 'Bear|Barbarian||Totem Warrior||3',
                  },
                ],
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
