import { describe, expect, test } from 'vitest'
import {
  getLegacyClassChoiceSelection,
  getStandaloneClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { NormalizedCharacterChoice } from '@/types/classRules'

function choice(overrides: Partial<NormalizedCharacterChoice>): NormalizedCharacterChoice {
  return {
    id: 'class:any|hb|choice:any|1',
    label: 'Any Choice',
    kind: 'class-feature',
    owner: { type: 'class', name: 'Any', source: 'HB' },
    level: 1,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array(20).fill(1),
    options: [],
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: 'test' },
    ...overrides,
  }
}

const emptyCatalogs = {
  classFeatures: [],
  feats: [],
  items: [],
  optionalFeatures: [],
  itemTypeByAbbr: {},
  weaponProficiencies: [],
}

describe('class choice option resolution', () => {
  test('resolves explicit references by name and source', () => {
    const result = resolveClassChoiceOptions(
      choice({
        options: [
          { entityType: 'classFeature', name: 'First Path', source: 'HB' },
          { entityType: 'classFeature', name: 'First Path', source: 'ALT' },
        ],
      }),
      {
        ...emptyCatalogs,
        classFeatures: [
          { name: 'First Path', source: 'HB', entries: ['HB text'] },
          { name: 'First Path', source: 'ALT', entries: ['ALT text'] },
        ],
      },
    )

    expect(result.map((option) => option.entries[0])).toEqual(['ALT text', 'HB text'])
  })

  test('matches item filters through parsed type metadata and weapon categories', () => {
    const result = resolveClassChoiceOptions(
      choice({
        kind: 'item',
        optionFilter: { entityType: 'item', itemTypes: ['simple weapon', 'tool'] },
      }),
      {
        ...emptyCatalogs,
        items: [
          { name: 'Training Blade', source: 'HB', type: 'M', weaponCategory: 'simple' },
          { name: 'Craft Kit', source: 'HB', type: 'T' },
          { name: 'Heavy Blade', source: 'HB', type: 'M', weaponCategory: 'martial' },
        ],
        itemTypeByAbbr: { T: 'Tool' },
      },
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Craft Kit', 'Training Blade'])
  })

  test('limits proficiency-bound item choices to current weapon proficiencies', () => {
    const result = resolveClassChoiceOptions(
      choice({
        kind: 'item',
        optionFilter: {
          entityType: 'item',
          itemTypes: ['simple weapon', 'martial weapon'],
          requiresProficiency: true,
        },
      }),
      {
        ...emptyCatalogs,
        items: [
          { name: 'Training Blade', source: 'HB', type: 'M', weaponCategory: 'simple' },
          { name: 'Heavy Blade', source: 'HB', type: 'M', weaponCategory: 'martial' },
        ],
        weaponProficiencies: ['simple weapons'],
      },
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Training Blade'])
  })

  test('matches feat and optional-feature filters without name-based rules', () => {
    const featOptions = resolveClassChoiceOptions(
      choice({ kind: 'feat', optionFilter: { entityType: 'feat', categories: ['STYLE'] } }),
      {
        ...emptyCatalogs,
        feats: [
          { name: 'A', source: 'HB', category: 'STYLE' },
          { name: 'B', source: 'HB', category: 'OTHER' },
        ],
      },
    )
    const featureOptions = resolveClassChoiceOptions(
      choice({
        kind: 'optional-feature',
        optionFilter: { entityType: 'optionalFeature', featureTypes: ['CUSTOM'] },
      }),
      {
        ...emptyCatalogs,
        optionalFeatures: [
          { name: 'C', source: 'HB', featureType: ['CUSTOM'] },
          { name: 'D', source: 'HB', featureType: ['OTHER'] },
        ],
      },
    )

    expect(featOptions.map((option) => option.reference.name)).toEqual(['A'])
    expect(featureOptions.map((option) => option.reference.name)).toEqual(['C'])
  })

  test('keeps saved source-qualified options visible after catalog filtering', () => {
    const result = resolveClassChoiceOptions(choice({}), emptyCatalogs, [
      { entityType: 'item', name: 'Archived Choice', source: 'OLD', slotLevel: 1 },
    ])

    expect(result[0]?.reference).toEqual({
      entityType: 'item',
      name: 'Archived Choice',
      source: 'OLD',
    })
  })

  test('routes optional-feature progressions through normalized choices', () => {
    const standalone = choice({ label: 'Standalone' })
    const optional = choice({
      label: 'Optional Pool',
      source: { kind: 'optional-feature-progression', field: 'optionalfeatureProgression[0]' },
    })
    const featProgression = choice({ label: 'Feat Pool', kind: 'feat' })

    expect(
      getStandaloneClassChoices({
        normalizedRules: { choices: [standalone, optional, featProgression] },
        featProgression: [{ name: 'Feat Pool' }],
      }),
    ).toEqual([standalone, optional])
  })

  test('projects legacy class-owned optional features into a normalized choice', () => {
    const optional = choice({
      label: 'Optional Pool',
      kind: 'optional-feature',
      source: { kind: 'optional-feature-progression', field: 'optionalfeatureProgression[0]' },
      optionFilter: { entityType: 'optionalFeature', featureTypes: ['CUSTOM'] },
    })
    const ledger = addGrant(
      emptyProvenance(),
      'features',
      'Legacy Option',
      makeSourceTag('class', 'Any', 'choice', 'HB'),
    )

    expect(
      getLegacyClassChoiceSelection(
        optional,
        [
          {
            reference: {
              entityType: 'optionalFeature',
              name: 'Legacy Option',
              source: 'HB',
            },
            entries: [],
          },
        ],
        ledger,
      ),
    ).toMatchObject({
      choiceId: optional.id,
      selected: [{ name: 'Legacy Option', source: 'HB', slotLevel: 1 }],
    })
  })
})
