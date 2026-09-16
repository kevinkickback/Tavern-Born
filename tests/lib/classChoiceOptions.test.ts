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
  itemsBase: [],
  itemMasteries: [],
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
          { name: 'Flaming Training Blade', source: 'HB', type: 'M', weaponCategory: 'simple' },
        ],
        itemsBase: [
          {
            name: 'Training Blade',
            source: 'HB',
            type: 'M',
            weaponCategory: 'simple',
            mastery: ['Sap|XPHB'],
          },
          { name: 'Craft Kit', source: 'HB', type: 'T' },
          { name: 'Heavy Blade', source: 'HB', type: 'M', weaponCategory: 'martial' },
        ],
        itemTypeByAbbr: { T: 'Tool' },
        itemMasteries: [{ name: 'Sap', source: 'XPHB', entries: ['Sap details'] }],
      },
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Craft Kit', 'Training Blade'])
    expect(result.find((option) => option.reference.name === 'Training Blade')?.masteries).toEqual([
      { name: 'Sap', source: 'XPHB', entries: ['Sap details'] },
    ])
    expect(result.find((option) => option.reference.name === 'Training Blade')).toMatchObject({
      weaponCategory: 'simple',
      weaponRange: 'Melee',
    })
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
        itemsBase: [
          { name: 'Training Blade', source: 'HB', type: 'M', weaponCategory: 'simple' },
          { name: 'Heavy Blade', source: 'HB', type: 'M', weaponCategory: 'martial' },
        ],
        weaponProficiencies: ['simple weapons'],
      },
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Training Blade'])
  })

  test('limits mastery choices to ordinary weapons with mastery properties', () => {
    const result = resolveClassChoiceOptions(
      choice({
        kind: 'item',
        optionFilter: {
          entityType: 'item',
          itemTypes: ['simple weapon', 'martial weapon'],
          requiresMastery: true,
        },
      }),
      {
        ...emptyCatalogs,
        itemsBase: [
          {
            name: 'Mastered Blade',
            source: 'XPHB',
            type: 'M',
            weaponCategory: 'simple',
            mastery: ['Sap|XPHB'],
          },
          { name: 'Legacy Blade', source: 'PHB', type: 'M', weaponCategory: 'simple' },
        ],
      },
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Mastered Blade'])
  })

  test('enforces weapon-range restrictions independently from weapon category', () => {
    const result = resolveClassChoiceOptions(
      choice({
        kind: 'item',
        optionFilter: {
          entityType: 'item',
          itemTypes: ['simple weapon', 'martial weapon'],
          weaponRanges: ['melee'],
          requiresMastery: true,
        },
      }),
      {
        ...emptyCatalogs,
        itemsBase: [
          {
            name: 'Simple Blade',
            source: 'XPHB',
            type: 'M',
            weaponCategory: 'simple',
            mastery: ['Sap|XPHB'],
          },
          {
            name: 'Simple Bow',
            source: 'XPHB',
            type: 'R',
            weaponCategory: 'simple',
            mastery: ['Vex|XPHB'],
          },
          {
            name: 'Martial Blade',
            source: 'XPHB',
            type: 'M',
            weaponCategory: 'martial',
            mastery: ['Sap|XPHB'],
          },
          {
            name: 'Martial Bow',
            source: 'XPHB',
            type: 'R',
            weaponCategory: 'martial',
            mastery: ['Vex|XPHB'],
          },
        ],
      },
      [{ entityType: 'item', name: 'Martial Bow', source: 'XPHB', slotLevel: 1 }],
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Martial Blade', 'Simple Blade'])
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

  test('routes every supported class choice through the normalized workflow', () => {
    const standalone = choice({ label: 'Standalone' })
    const optional = choice({
      label: 'Optional Pool',
      source: { kind: 'optional-feature-progression', field: 'optionalfeatureProgression[0]' },
    })
    const featProgression = choice({ label: 'Feat Pool', kind: 'feat' })

    expect(
      getStandaloneClassChoices({
        normalizedRules: { choices: [standalone, optional, featProgression] },
      }),
    ).toEqual([standalone, optional, featProgression])
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
        { provenance: ledger },
      ),
    ).toMatchObject({
      choiceId: optional.id,
      selected: [{ name: 'Legacy Option', source: 'HB', slotLevel: 1 }],
    })
  })

  test('projects a source-qualified legacy class feat into a normalized choice', () => {
    const feat = choice({
      label: 'Style Training',
      kind: 'feat',
      optionFilter: { entityType: 'feat', categories: ['STYLE'] },
    })
    const option = {
      reference: { entityType: 'feat' as const, name: 'Guarded Style', source: 'HB' },
      entries: [],
    }

    expect(
      getLegacyClassChoiceSelection(feat, [option], {
        classFeatChoices: [
          {
            id: 'legacy-style',
            className: 'Any',
            classSource: 'HB',
            progressionName: 'Style Training',
            categories: ['STYLE'],
            feats: [
              {
                id: 'legacy-feat',
                name: 'Guarded Style',
                source: 'HB',
                description: '',
                classLevel: 1,
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      choiceId: feat.id,
      selected: [{ entityType: 'feat', name: 'Guarded Style', source: 'HB', slotLevel: 1 }],
    })
  })
})
