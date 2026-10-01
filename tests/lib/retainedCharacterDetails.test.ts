import { describe, expect, test } from 'vitest'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import type { CharacterClassChoiceSelection } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

function selection(
  overrides: Partial<CharacterClassChoiceSelection> = {},
): CharacterClassChoiceSelection {
  return {
    choiceId: 'scholar-option',
    label: 'Scholar Choice',
    kind: 'subclass-feature',
    className: 'Wizard',
    classSource: 'PHB',
    classLevel: 3,
    subclassName: 'Scholar',
    subclassSource: 'SUPP',
    selected: [
      { entityType: 'subclassFeature', name: 'Shared Option', source: 'SUPP', slotLevel: 3 },
    ],
    ...overrides,
  }
}

function scholarClass(
  className = 'Wizard',
  classSource = 'PHB',
  subclassName = 'Scholar',
  subclassSource = 'SUPP',
) {
  const feature = {
    name: 'Shared Option',
    source: subclassSource,
    entries: [`${className}|${classSource}|${subclassName}|${subclassSource}`],
  }
  return makeClassFixture({
    name: className,
    source: classSource,
    subclasses: [
      {
        name: subclassName,
        shortName: `${subclassName} Short`,
        source: subclassSource,
        className,
        classSource,
        subclassFeatureRefs: [
          {
            ref: 'shared-option',
            name: feature.name,
            source: feature.source,
            className,
            classSource,
            subclassShortName: subclassName,
            subclassSource,
            feature,
          },
        ],
      },
    ],
  })
}

describe('retained character details', () => {
  test.each([
    'PHB',
    'XPHB',
  ])('resolves a filtered nested subclass choice under its exact %s owner', (classSource) => {
    const rawClass = scholarClass('Wizard', classSource)
    const raw = makeGameDataFixture({ classes: [rawClass] })
    const primary = makeGameDataFixture({ classes: [{ ...rawClass, subclasses: [] }] })
    const choice = selection({ classSource })
    const character = makeCharacterFixture({ classChoiceSelections: [choice] })
    const before = structuredClone(character)
    const result = buildRetainedCharacterDetails(character, primary, raw)
    expect(result.choiceDetailsById.get(choice.choiceId)).toEqual([
      {
        availability: 'source-unavailable',
        entries: [`Wizard|${classSource}|Scholar|SUPP`],
      },
    ])
    expect(character).toEqual(before)
  })

  test('keeps identical feature names distinct across class, subclass, and source owners', () => {
    const raw = makeGameDataFixture({
      classes: [
        scholarClass('Fighter'),
        scholarClass('Wizard', 'XPHB'),
        scholarClass('Wizard', 'PHB', 'Other Scholar'),
        scholarClass('Wizard', 'PHB', 'Scholar', 'ALT'),
        scholarClass(),
      ],
    })
    const choices = [
      selection(),
      selection({ choiceId: 'fighter', className: 'Fighter' }),
      selection({ choiceId: 'revised', classSource: 'XPHB' }),
      selection({ choiceId: 'other', subclassName: 'Other Scholar' }),
      selection({
        choiceId: 'alternate',
        subclassSource: 'ALT',
        selected: [
          {
            entityType: 'subclassFeature',
            name: 'Shared Option',
            source: 'ALT',
            slotLevel: 3,
          },
        ],
      }),
      selection({ choiceId: 'short-name', subclassName: 'Scholar Short' }),
    ]
    const result = buildRetainedCharacterDetails(
      makeCharacterFixture({ classChoiceSelections: choices }),
      makeGameDataFixture(),
      raw,
    )
    for (const [id, entries] of [
      ['scholar-option', 'Wizard|PHB|Scholar|SUPP'],
      ['fighter', 'Fighter|PHB|Scholar|SUPP'],
      ['revised', 'Wizard|XPHB|Scholar|SUPP'],
      ['other', 'Wizard|PHB|Other Scholar|SUPP'],
      ['alternate', 'Wizard|PHB|Scholar|ALT'],
      ['short-name', 'Wizard|PHB|Scholar|SUPP'],
    ])
      expect(result.choiceDetailsById.get(id)?.[0].entries).toEqual([entries])
  })

  test('uses class context for top-level and nested class features', () => {
    const feature = { name: 'Shared Feature', source: 'SUPP', entries: ['wizard feature'] }
    const raw = makeGameDataFixture({
      classFeatures: [
        { ...feature, className: 'Fighter', classSource: 'PHB', entries: ['fighter feature'] },
      ],
      classes: [makeClassFixture({ classFeatures: [feature] })],
    })
    const choice = selection({
      selected: [
        { entityType: 'classFeature', name: feature.name, source: feature.source, slotLevel: 3 },
      ],
    })
    const result = buildRetainedCharacterDetails(
      makeCharacterFixture({ classChoiceSelections: [choice] }),
      makeGameDataFixture(),
      raw,
    )
    expect(result.choiceDetailsById.get(choice.choiceId)?.[0].entries).toEqual(['wizard feature'])
  })

  test('prefers exact filtered details and treats empty loaded entries as available', () => {
    const choice = selection({
      selected: [{ entityType: 'feat', name: 'Shared Feat', source: 'SUPP', slotLevel: 3 }],
    })
    const primary = makeGameDataFixture({
      feats: [{ name: 'Shared Feat', source: 'SUPP', entries: [] }],
    })
    const raw = makeGameDataFixture({
      feats: [{ name: 'Shared Feat', source: 'SUPP', entries: ['raw details'] }],
    })
    expect(
      buildRetainedCharacterDetails(
        makeCharacterFixture({ classChoiceSelections: [choice] }),
        primary,
        raw,
      ).choiceDetailsById.get(choice.choiceId),
    ).toEqual([{ availability: 'available', entries: [] }])
  })

  test('does not guess unloaded references, sources, or feature owners', () => {
    const raw = makeGameDataFixture({ classes: [scholarClass()] })
    const choices = [
      selection({ choiceId: 'missing-class', className: 'Missing Class' }),
      selection({ choiceId: 'missing-subclass', subclassName: 'Missing Subclass' }),
      selection({
        choiceId: 'missing-source',
        selected: [{ entityType: 'subclassFeature', name: 'Shared Option', slotLevel: 3 }],
      }),
      selection({
        choiceId: 'wrong-source',
        selected: [
          { entityType: 'subclassFeature', name: 'Shared Option', source: 'ALT', slotLevel: 3 },
        ],
      }),
      selection({
        choiceId: 'missing-name',
        selected: [
          { entityType: 'subclassFeature', name: 'Unloaded Option', source: 'SUPP', slotLevel: 3 },
        ],
      }),
    ]
    const result = buildRetainedCharacterDetails(
      makeCharacterFixture({ classChoiceSelections: choices }),
      makeGameDataFixture(),
      raw,
    )
    for (const choice of choices)
      expect(result.choiceDetailsById.get(choice.choiceId)).toEqual([
        { availability: 'missing', entries: [] },
      ])
  })

  test('retains exact non-feature choice details and all creature action categories', () => {
    const choice = selection({
      selected: [
        { entityType: 'optionalFeature', name: 'Shared', source: 'SUPP', slotLevel: 3 },
        { entityType: 'item', name: 'Shared', source: 'SUPP', slotLevel: 3 },
        { entityType: 'creature', name: 'Shared', source: 'SUPP', slotLevel: 3 },
      ],
    })
    const raw = makeGameDataFixture({
      optionalfeatures: [{ name: 'Shared', source: 'SUPP', entries: ['optional details'] }],
      items: [{ name: 'Shared', source: 'SUPP', type: 'W', entries: ['item details'] }],
      creatures: [
        {
          name: 'Shared',
          source: 'SUPP',
          entries: ['creature details'],
          bonus: [{ name: 'Bonus', entries: ['bonus details'] }],
          reaction: [{ name: 'Reaction', entries: ['reaction details'] }],
        },
      ],
    })
    const details = buildRetainedCharacterDetails(
      makeCharacterFixture({ classChoiceSelections: [choice] }),
      makeGameDataFixture(),
      raw,
    ).choiceDetailsById.get(choice.choiceId)!
    expect(details.map((detail) => detail.availability)).toEqual(
      Array(3).fill('source-unavailable'),
    )
    expect(details[0].entries).toEqual(['optional details'])
    expect(details[1].entries).toEqual(['item details'])
    expect(details[2].entries).toEqual([
      'creature details',
      { type: 'entries', name: 'Bonus', entries: ['bonus details'] },
      { type: 'entries', name: 'Reaction', entries: ['reaction details'] },
    ])
  })
})
