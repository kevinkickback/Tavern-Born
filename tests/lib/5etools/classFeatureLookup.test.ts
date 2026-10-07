import { describe, expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../../fixtures/gameDataFixtures'

const wizard: ClassFeature = {
  name: 'Shared',
  source: 'PHB',
  className: 'Wizard',
  classSource: 'PHB',
  level: 1,
  entries: ['As an action, use the Wizard feature.'],
}
const bard: ClassFeature = {
  ...wizard,
  className: 'Bard',
  entries: ['As a bonus action, use the Bard feature.'],
}

function lookups(features: ClassFeature[]) {
  return buildGameDataLookups(makeGameDataFixture({ classFeatures: features }))
}

function storedAction(
  features: ClassFeature[],
  description = 'As a reaction, use the saved feature.',
) {
  return deriveRulesTextActions(
    makeCharacterFixture({
      classProgression: [],
      features: [{ id: 'saved', name: 'Shared', source: 'PHB', description }],
    }),
    undefined,
    lookups(features),
  )
}

function earnedFeatureFixture(
  kind: 'class' | 'subclass',
  description: string,
  catalogFeatures = [wizard, bard],
  gainLevel = 1,
) {
  const reference = {
    ref: `Shared|Wizard||${gainLevel}`,
    name: 'Shared',
    source: 'PHB',
    className: 'Wizard',
    classSource: 'PHB',
    level: gainLevel,
    feature: { ...wizard, level: gainLevel },
  }
  const classData = makeClassFixture({
    classFeatureRefs: kind === 'class' ? [reference] : [],
    subclasses: [
      {
        name: 'Test School',
        shortName: 'Test School',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        subclassFeatureRefs: [
          {
            ...reference,
            ref: `Shared|Wizard||Test School||${gainLevel}`,
            subclassShortName: 'Test School',
            subclassSource: 'PHB',
            feature: {
              ...reference.feature,
              subclassShortName: 'Test School',
              subclassSource: 'PHB',
            },
          },
        ],
      },
    ],
  })
  const classes = [classData]
  const context = {
    ...buildGameDataLookups(makeGameDataFixture({ classes, classFeatures: catalogFeatures })),
    classes,
  }
  const character = makeCharacterFixture({
    classProgression: [
      {
        name: 'Wizard',
        source: 'PHB',
        levels: 1,
        ...(kind === 'subclass' ? { subclass: 'Test School', subclassSource: 'PHB' } : {}),
      },
    ],
    features: [{ id: 'saved', name: 'Shared', source: 'PHB', description }],
  })
  return { character, context }
}

describe('global class-feature identity', () => {
  test.each([
    false,
    true,
  ])('retains every complete owner, level and printing identity (%s)', (reverse) => {
    const features = [
      wizard,
      bard,
      { ...wizard, level: 6 },
      { ...wizard, classSource: 'XPHB' },
      { ...wizard, source: 'TCE' },
    ]
    if (reverse) features.reverse()
    const before = structuredClone(features)
    const index = lookups(features).classFeaturesByKey
    expect(Object.keys(index).sort()).toEqual([
      'class-feature|shared|bard|phb|1|phb',
      'class-feature|shared|wizard|phb|1|phb',
      'class-feature|shared|wizard|phb|1|tce',
      'class-feature|shared|wizard|phb|6|phb',
      'class-feature|shared|wizard|xphb|1|phb',
    ])
    expect(index['class-feature|shared|wizard|phb|1|phb']).toBe(wizard)
    expect(features).toEqual(before)
  })

  test('uses upstream class-source defaults and canonical case without rewriting the record', () => {
    const record = { ...wizard, name: ' Shared ', className: ' WIZARD ', classSource: undefined }
    expect(lookups([record]).classFeaturesByKey).toEqual({
      'class-feature|shared|wizard|phb|1|phb': record,
    })
  })

  test('retains the first record only when the full canonical identity is duplicated', () => {
    const duplicate = {
      ...wizard,
      name: 'SHARED',
      entries: ['Different text for the same identity.'],
    }
    const index = lookups([wizard, duplicate, bard]).classFeaturesByKey
    expect(Object.values(index)).toEqual([wizard, bard])
  })

  test('retains incomplete records without conflating them or assigning complete identities', () => {
    const incomplete = [
      { ...wizard, className: undefined },
      { ...wizard, level: undefined },
    ]
    const index = lookups([...incomplete, wizard]).classFeaturesByKey
    expect(Object.values(index)).toEqual([...incomplete, wizard])
    expect(Object.keys(index).filter((key) => key.startsWith('class-feature|'))).toEqual([
      'class-feature|shared|wizard|phb|1|phb',
    ])
  })
})

describe('legacy stored-feature action descriptions', () => {
  test.each([
    {
      first: wizard,
      duplicate: { ...wizard, name: 'shared', source: 'phb' },
      name: 'shared',
      source: 'phb',
    },
    { first: { ...wizard, source: '' }, duplicate: wizard, name: 'Shared', source: 'PHB' },
    {
      first: { ...wizard, source: undefined } as unknown as ClassFeature,
      duplicate: wizard,
      name: 'Shared',
      source: 'PHB',
    },
    {
      first: { ...wizard, classSource: 'XPHB', source: '' },
      duplicate: { ...wizard, classSource: 'XPHB', source: 'XPHB' },
      name: 'Shared',
      source: 'XPHB',
    },
  ])('enriches saved spellings from a canonical duplicate with source defaults: %j', ({
    first,
    duplicate,
    name,
    source,
  }) => {
    const character = makeCharacterFixture({
      classProgression: [],
      features: [{ id: 'saved', name, source, description: '' }],
    })
    const context = lookups([first, duplicate])
    context.optionalFeaturesByKey[`${name}|${source}`] = {
      name,
      source,
      entries: ['As a bonus action, use the optional feature.'],
    }
    expect(deriveRulesTextActions(character, undefined, context)[0]?.kind).toBe('action')
  })

  test.each(
    [
      [wizard, { ...bard, name: 'shared', source: 'phb' }],
      [{ ...wizard, source: '' }, bard],
    ].map((features) => ({ features })),
  )('keeps owner ambiguity after canonical case/default normalization: %j', ({ features }) => {
    expect(storedAction(features)[0]?.kind).toBe('reaction')
  })

  test('does not guess the printing of a saved feature without a source', () => {
    const character = makeCharacterFixture({
      classProgression: [],
      features: [
        {
          id: 'saved',
          name: 'Shared',
          source: '',
          description: 'As a reaction, use the saved feature.',
        },
      ],
    })
    expect(
      deriveRulesTextActions(character, undefined, lookups([{ ...wizard, source: '' }]))[0]?.kind,
    ).toBe('reaction')
  })

  test.each([
    { features: [wizard, bard] },
    { features: [bard, wizard] },
    { features: [wizard, { ...wizard, level: 6 }] },
  ])('preserves saved action text when owner or level is ambiguous: %j', ({ features }) => {
    expect(storedAction(features).map((action) => action.kind)).toEqual(['reaction'])
  })

  test('does not manufacture an action for an ambiguous feature with no saved description', () => {
    expect(storedAction([wizard, bard], '')).toEqual([])
  })

  test('preserves unique catalog enrichment and exact-identity duplicate behavior', () => {
    expect(storedAction([wizard])[0]?.kind).toBe('action')
    expect(storedAction([wizard, { ...wizard }])[0]?.kind).toBe('action')
  })

  test('retains saved text for incomplete ambiguous records', () => {
    expect(
      storedAction([
        { ...wizard, className: undefined },
        { ...bard, className: undefined },
      ])[0]?.kind,
    ).toBe('reaction')
  })

  test('does not substitute an optional feature for an ambiguous class feature', () => {
    const context = lookups([wizard, bard])
    context.optionalFeaturesByKey['Shared|PHB'] = {
      name: 'Shared',
      source: 'PHB',
      entries: ['As a bonus action, use the optional feature.'],
    }
    const character = makeCharacterFixture({
      classProgression: [],
      features: [
        {
          id: 'saved',
          name: 'Shared',
          source: 'PHB',
          description: 'As a reaction, use the saved feature.',
        },
      ],
    })
    expect(deriveRulesTextActions(character, undefined, context)[0]?.kind).toBe('reaction')
  })

  test('still enriches an optional feature when no class feature matches its printing', () => {
    const context = lookups([{ ...wizard, source: 'TCE' }])
    context.optionalFeaturesByKey['Shared|PHB'] = {
      name: 'Shared',
      source: 'PHB',
      entries: ['As a bonus action, use the optional feature.'],
    }
    const character = makeCharacterFixture({
      classProgression: [],
      features: [{ id: 'saved', name: 'Shared', source: 'PHB', description: '' }],
    })
    expect(deriveRulesTextActions(character, undefined, context)[0]?.kind).toBe('bonus-action')
  })

  test('accepts a unique legacy map supplied without rebuilding the catalog', () => {
    const character = makeCharacterFixture({
      classProgression: [],
      features: [{ id: 'saved', name: 'Shared', source: 'PHB', description: '' }],
    })
    expect(
      deriveRulesTextActions(character, undefined, {
        classFeaturesByKey: { 'Shared|PHB': wizard },
      })[0]?.kind,
    ).toBe('action')
  })

  test.each([
    { first: wizard, duplicate: { ...wizard, name: 'shared', source: 'phb' } },
    { first: { ...wizard, source: '' }, duplicate: wizard },
  ])('treats complete duplicate identities in legacy alias maps as a single target: %j', ({
    first,
    duplicate,
  }) => {
    const character = makeCharacterFixture({
      classProgression: [],
      features: [{ id: 'saved', name: 'Shared', source: 'PHB', description: '' }],
    })
    const context = { classFeaturesByKey: { first, duplicate } }
    expect(deriveRulesTextActions(character, undefined, context)[0]?.kind).toBe('action')
  })
})

describe.each(['class', 'subclass'] as const)('earned %s actions beside saved features', (kind) => {
  test.each([
    '',
    'A passive benefit.',
  ])('keeps a qualified earned action when ambiguous saved text grants no action: %j', (description) => {
    const { character, context } = earnedFeatureFixture(kind, description)
    const before = structuredClone({ character, context })
    const actions = deriveRulesTextActions(character, undefined, context)
    expect(actions).toMatchObject([
      {
        name: 'Shared',
        kind: 'action',
        description: 'As an action, use the Wizard feature.',
        source: { kind },
      },
    ])
    expect(actions[0]?.id).toMatch(new RegExp(`^${kind}-feature:`))
    expect(createCharacterSheetViewModel(character, context).actions).toEqual(actions)
    expect({ character, context }).toEqual(before)
  })

  test('keeps a real saved action without duplicating the earned action', () => {
    const { character, context } = earnedFeatureFixture(
      kind,
      'As a reaction, use the saved feature.',
    )
    const actions = deriveRulesTextActions(character, undefined, context)
    expect(actions).toMatchObject([
      { id: 'feature:saved', kind: 'reaction', source: { kind: 'other' } },
    ])
    expect(createCharacterSheetViewModel(character, context).actions).toEqual(actions)
  })

  test('keeps unique saved-feature enrichment without duplicating the earned action', () => {
    const { character, context } = earnedFeatureFixture(kind, '', [wizard])
    expect(deriveRulesTextActions(character, undefined, context)).toMatchObject([
      { id: 'feature:saved', kind: 'action', source: { kind: 'other' } },
    ])
  })

  test('does not gain an action before the qualified feature is earned', () => {
    const { character, context } = earnedFeatureFixture(kind, '', [wizard, bard], 3)
    expect(deriveRulesTextActions(character, undefined, context)).toEqual([])
    expect(createCharacterSheetViewModel(character, context).actions).toEqual([])
  })

  test.each([
    '',
    'As a reaction, use the saved feature.',
  ])('matches canonical saved spelling when suppressing an earned action: %j', (description) => {
    const { character, context } = earnedFeatureFixture(
      kind,
      description,
      description ? [wizard, bard] : [wizard],
    )
    character.features[0] = { ...character.features[0], name: 'shared', source: 'phb' }
    const actions = deriveRulesTextActions(character, undefined, context)
    expect(actions).toMatchObject([
      { id: 'feature:saved', kind: description ? 'reaction' : 'action', source: { kind: 'other' } },
    ])
    expect(createCharacterSheetViewModel(character, context).actions).toEqual(actions)
  })

  test('keeps different saved and earned feature printings separate', () => {
    const { character, context } = earnedFeatureFixture(
      kind,
      'As a reaction, use the saved feature.',
    )
    character.features[0] = { ...character.features[0], source: 'TCE' }
    expect(deriveRulesTextActions(character, undefined, context)).toMatchObject([
      { id: 'feature:saved', kind: 'reaction', source: { source: 'TCE' } },
      { kind: 'action', source: { kind, source: 'PHB' } },
    ])
  })
})

describe('earned class-action source compatibility', () => {
  test.each(
    ['PHB', 'XPHB'].flatMap((classSource) =>
      ['', undefined].map((source) => ({ classSource, source })),
    ),
  )('suppresses the parsed earned action after unique default-source enrichment: %j', ({
    classSource,
    source,
  }) => {
    const raw = {
      class: [
        { name: 'Wizard', source: classSource, classFeatures: [`Shared|Wizard|${classSource}|1`] },
      ],
      classFeature: [{ ...wizard, classSource, source }],
    }
    const classes = parseClasses(raw) as Class5e[]
    const context = {
      ...buildGameDataLookups(
        makeGameDataFixture({ classes, classFeatures: parseClassFeatures(raw) as ClassFeature[] }),
      ),
      classes,
    }
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: classSource, levels: 1 }],
      features: [{ id: 'saved', name: 'Shared', source: classSource, description: '' }],
    })
    expect(classes[0].classFeatureRefs?.[0]?.feature).toBeDefined()
    const actions = deriveRulesTextActions(character, undefined, context)
    expect(actions).toMatchObject([
      { id: 'feature:saved', kind: 'action', source: { source: classSource } },
    ])
    expect(createCharacterSheetViewModel(character, context).actions).toEqual(actions)
  })

  test('preserves separately emitted automatic actions with different owners and spelling', () => {
    const classes = [wizard, { ...bard, name: 'shared', source: 'phb' }].map((feature) =>
      makeClassFixture({
        name: feature.className,
        classFeatureRefs: [
          {
            ref: `${feature.name}|${feature.className}||1`,
            name: feature.name,
            className: feature.className!,
            source: feature.source,
            level: 1,
            feature,
          },
        ],
      }),
    )
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 1 },
        { name: 'Bard', source: 'PHB', levels: 1 },
      ],
      features: [],
    })
    expect(
      deriveRulesTextActions(character, undefined, { classes }).map(({ kind }) => kind),
    ).toEqual(['action', 'bonus-action'])
  })

  test('preserves an existing materialized action ID when no UID is supplied', () => {
    const { character, context } = earnedFeatureFixture('class', '')
    character.features = []
    context.classes[0].classFeatureRefs![0].ref = ''
    expect(deriveRulesTextActions(character, undefined, context)[0]?.id).toBe(
      'class-feature:Shared%7CPHB',
    )
  })
})
