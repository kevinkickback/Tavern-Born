import { describe, expect, test } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { ClassFeatureReference } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

function observe(
  uid: unknown,
  metadataLevel: unknown,
  featureLevel: unknown,
  characterLevel: number,
) {
  const reference = {
    ...(uid !== undefined ? { ref: uid } : {}),
    name: 'Shared',
    source: 'PHB',
    className: 'Wizard',
    classSource: 'PHB',
    ...(metadataLevel !== undefined ? { level: metadataLevel } : {}),
    feature: {
      name: 'Shared',
      source: 'PHB',
      className: 'Wizard',
      classSource: 'PHB',
      ...(featureLevel !== undefined ? { level: featureLevel } : {}),
      entries: ['As an action, use the feature.'],
    },
  } as unknown as ClassFeatureReference
  const classes = [makeClassFixture({ classFeatureRefs: [reference] })]
  const character = makeCharacterFixture({
    features: [],
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: characterLevel }],
  })
  const before = structuredClone({ character, classes })
  const actions = deriveRulesTextActions(character, undefined, { classes })
  expect(
    createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).actions,
  ).toEqual(actions)
  expect({ character, classes }).toEqual(before)
  return actions
}

describe('automatic class-action gain levels', () => {
  test.each([
    'Shared|Wizard||8junk',
    'Shared||PHB|1',
    '|Wizard||1',
    'Shared|Wizard',
    'Shared|Wizard||0',
    'Shared|Wizard||Infinity',
  ])('does not repair an invalid nonempty UID with numeric metadata: %s', (uid) => {
    expect(observe(uid, 1, 1, 1)).toEqual([])
  })

  test.each([
    { uid: 'Shared|Wizard||8', metadata: 1, feature: 8, level: 7, count: 0 },
    { uid: 'Shared|Wizard||8', metadata: 20, feature: 8, level: 8, count: 1 },
    { uid: 'Shared|Wizard||1', metadata: 8, feature: 1, level: 1, count: 1 },
    { uid: 'Shared|Wizard||0x8', metadata: 1, feature: 8, level: 7, count: 0 },
    { uid: 'Shared|Wizard||0x8', metadata: 1, feature: 8, level: 8, count: 1 },
    { uid: 'Shared|Wizard||1||99', metadata: 1, feature: 1, level: 1, count: 1 },
  ])('earns the action at the complete encoded level: %j', ({
    uid,
    metadata,
    feature,
    level,
    count,
  }) => {
    const actions = observe(uid, metadata, feature, level)
    expect(actions).toHaveLength(count)
    if (count) expect(actions[0]?.id).toBe(`class-feature:${encodeURIComponent(uid)}`)
  })

  test.each([
    { uid: undefined, metadata: 2, feature: 8, level: 1, count: 0 },
    { uid: undefined, metadata: 2, feature: 8, level: 2, count: 1 },
    { uid: '', metadata: undefined, feature: 2, level: 2, count: 1 },
    { uid: '  ', metadata: 2, feature: undefined, level: 2, count: 1 },
    { uid: '', metadata: undefined, feature: undefined, level: 1, count: 0 },
    { uid: '', metadata: 0, feature: 2, level: 2, count: 0 },
    { uid: '', metadata: Number.NaN, feature: 2, level: 2, count: 0 },
    { uid: 42, metadata: 2, feature: 2, level: 2, count: 0 },
  ])('validates materialized gain levels only when no UID is available: %j', ({
    uid,
    metadata,
    feature,
    level,
    count,
  }) => {
    expect(observe(uid, metadata, feature, level)).toHaveLength(count)
  })

  test('keeps a valid selected subclass action with its separate UID layout', () => {
    const classes = [
      makeClassFixture({
        classFeatureRefs: [],
        subclasses: [
          {
            name: 'Test School',
            shortName: 'Test School',
            source: 'TCE',
            className: 'Wizard',
            classSource: 'PHB',
            subclassFeatureRefs: [
              {
                ref: 'School Action|Wizard|PHB|Test School|TCE|1|TCE',
                name: 'School Action',
                source: 'TCE',
                className: 'Wizard',
                classSource: 'PHB',
                subclassShortName: 'Test School',
                subclassSource: 'TCE',
                level: 1,
                feature: {
                  name: 'School Action',
                  source: 'TCE',
                  level: 1,
                  entries: ['As a reaction, use the school feature.'],
                },
              },
            ],
          },
        ],
      }),
    ]
    const character = makeCharacterFixture({
      features: [],
      classProgression: [
        {
          name: 'Wizard',
          source: 'PHB',
          levels: 1,
          subclass: 'Test School',
          subclassSource: 'TCE',
        },
      ],
    })
    const actions = deriveRulesTextActions(character, undefined, { classes })
    expect(actions).toMatchObject([
      { name: 'School Action', kind: 'reaction', source: { kind: 'subclass', source: 'TCE' } },
    ])
    expect(
      createCharacterSheetViewModel(character, { classesByKey: buildClassLookup(classes) }).actions,
    ).toEqual(actions)
  })
})
