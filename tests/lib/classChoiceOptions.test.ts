import { describe, expect, test } from 'vitest'
import {
  collectSubclassFeatures,
  getCharacterClassChoiceDiagnostics,
  getCharacterClassChoices,
  getStandaloneClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import type { Subclass5e } from '@/types/5etools'
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
  subclassFeatures: [],
  creatures: [],
  feats: [],
  items: [],
  itemsBase: [],
  itemMasteries: [],
  optionalFeatures: [],
  itemPropertyByAbbr: {},
  itemTypeByAbbr: {},
  weaponProficiencies: [],
}

describe('class choice option resolution', () => {
  test('collects direct subclass features and their embedded feature references', () => {
    const nested = { name: 'Nested Ward', source: 'HB', level: 3 }
    const direct = {
      name: 'Direct Ward',
      source: 'HB',
      level: 3,
      entries: [{ type: 'refSubclassFeature', feature: nested }],
    }
    const subclass = {
      name: 'School of Tests',
      shortName: 'Tests',
      source: 'HB',
      className: 'Wizard',
      subclassFeatures: [direct],
    } satisfies Subclass5e

    expect(collectSubclassFeatures(subclass).map((feature) => feature.name)).toEqual([
      'Direct Ward',
      'Nested Ward',
    ])
  })

  test('filters eligible Beast Master companions from parsed creature traits', () => {
    const result = resolveClassChoiceOptions(
      choice({
        kind: 'creature',
        optionFilter: {
          entityType: 'creature',
          creatureTypes: ['beast'],
          sizes: ['t', 's', 'm'],
          challengeRatingMaximum: 0.25,
          excludeSwarms: true,
        },
      }),
      {
        ...emptyCatalogs,
        creatures: [
          {
            name: 'Wolf',
            source: 'MM',
            type: 'beast',
            size: ['M'],
            cr: '1/4',
            ac: [13],
            hp: { average: 11, formula: '2d8 + 2' },
            speed: { walk: 40 },
            trait: [{ name: 'Pack Tactics', entries: ['The wolf has advantage.'] }],
            action: [{ name: 'Bite', entries: ['Melee Weapon Attack.'] }],
          },
          { name: 'Brown Bear', source: 'MM', type: 'beast', size: ['L'], cr: '1' },
          {
            name: 'Swarm of Rats',
            source: 'MM',
            type: { type: 'beast', swarmSize: 'T' },
            size: ['M'],
            cr: '1/4',
          },
          { name: 'Pseudodragon', source: 'MM', type: 'dragon', size: ['T'], cr: '1/4' },
        ],
      },
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Wolf'])
    expect(result[0]?.presentation).toEqual({
      kind: 'creature',
      summary: expect.objectContaining({
        armorClass: '13',
        hitPoints: '11 (2d8 + 2)',
        speed: '40 ft.',
        challenge: '1/4',
        traits: [{ name: 'Pack Tactics', entries: ['The wolf has advantage.'] }],
        actions: [{ name: 'Bite', entries: ['Melee Weapon Attack.'] }],
      }),
    })
    expect(result[0]?.searchText).toContain('Pack Tactics')
  })

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

  test('combines named magic-item plans with filtered rarity choices', () => {
    const filtered = (rarity: string, minimumClassLevel: number) => ({
      entityType: 'item' as const,
      rarities: [rarity],
      excludedItemTypes: ['potion', 'scroll'],
      excludeCursed: true,
      minimumClassLevel,
    })
    const planChoice = choice({
      kind: 'item',
      options: [{ entityType: 'item', name: 'Named Plan', source: 'HB', minimumClassLevel: 2 }],
      optionFilter: { entityType: 'item', anyOf: [filtered('common', 2), filtered('uncommon', 6)] },
    })
    const catalogs = {
      ...emptyCatalogs,
      items: [
        { name: 'Named Plan', source: 'HB', type: 'GV', rarity: 'rare' },
        { name: 'Common Compass', source: 'HB', type: 'W', rarity: 'common' },
        { name: 'Uncommon Boots', source: 'HB', type: 'W', rarity: 'uncommon' },
        { name: 'Common Potion', source: 'HB', type: 'P', rarity: 'common' },
        { name: 'Cursed Compass', source: 'HB', type: 'W', rarity: 'common', curse: true },
      ],
      itemTypeByAbbr: { P: 'Potion', W: 'Wondrous Item' },
    }
    const namesAt = (level: number) =>
      resolveClassChoiceOptions(planChoice, catalogs, [], level).map(
        (option) => option.reference.name,
      )

    expect(namesAt(2)).toEqual(['Common Compass', 'Named Plan'])
    expect(namesAt(6)).toEqual(['Common Compass', 'Named Plan', 'Uncommon Boots'])
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
            type: 'MW',
            weaponCategory: 'simple',
            mastery: ['Sap|XPHB'],
          },
          {
            name: 'Simple Bow',
            source: 'XPHB',
            type: 'RW',
            weaponCategory: 'simple',
            mastery: ['Vex|XPHB'],
          },
          {
            name: 'Martial Blade',
            source: 'XPHB',
            type: 'MW',
            weaponCategory: 'martial',
            mastery: ['Sap|XPHB'],
          },
          {
            name: 'Martial Bow',
            source: 'XPHB',
            type: 'RW',
            weaponCategory: 'martial',
            mastery: ['Vex|XPHB'],
          },
        ],
        itemTypeByAbbr: { MW: 'Melee Weapon', RW: 'Ranged Weapon' },
      },
      [{ entityType: 'item', name: 'Martial Bow', source: 'XPHB', slotLevel: 1 }],
    )

    expect(
      result
        .filter((option) => option.availability === 'eligible')
        .map((option) => option.reference.name),
    ).toEqual(['Martial Blade', 'Simple Blade'])
    expect(result.find((option) => option.reference.name === 'Martial Bow')?.availability).toBe(
      'retained',
    )
  })

  test('excludes item properties through parsed property metadata', () => {
    const result = resolveClassChoiceOptions(
      choice({
        kind: 'item',
        optionFilter: {
          entityType: 'item',
          itemTypes: ['simple weapon', 'martial weapon'],
          excludedItemProperties: ['heavy', 'special'],
        },
      }),
      {
        ...emptyCatalogs,
        itemsBase: [
          {
            name: 'Longsword',
            source: 'PHB',
            type: 'M',
            property: ['V'],
            weaponCategory: 'martial',
          },
          {
            name: 'Greatsword',
            source: 'PHB',
            type: 'M',
            property: ['H'],
            weaponCategory: 'martial',
          },
          {
            name: 'Net',
            source: 'PHB',
            type: 'R',
            property: ['S'],
            weaponCategory: 'martial',
          },
        ],
        itemPropertyByAbbr: { H: 'Heavy', S: 'Special', V: 'Versatile' },
        itemTypeByAbbr: { M: 'Martial Melee Weapon', R: 'Martial Ranged Weapon' },
      },
    )

    expect(result.map((option) => option.reference.name)).toEqual(['Longsword'])
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
    expect(featOptions[0]?.presentation).toEqual({ kind: 'feat', categoryLabel: 'STYLE' })
    expect(featureOptions[0]?.presentation).toEqual({
      kind: 'feature',
      featureTypeLabels: ['CUSTOM'],
    })
  })

  test('projects rune type and both rules paragraphs for choice presentation', () => {
    const result = resolveClassChoiceOptions(
      choice({
        kind: 'optional-feature',
        optionFilter: { entityType: 'optionalFeature', featureTypes: ['RN'] },
      }),
      {
        ...emptyCatalogs,
        optionalFeatures: [
          {
            name: 'Cloud Rune',
            source: 'TCE',
            featureType: ['RN'],
            entries: ['Passive benefit.', 'Invoked reaction benefit.'],
          },
        ],
      },
    )

    expect(result[0]).toMatchObject({
      entries: ['Passive benefit.', 'Invoked reaction benefit.'],
      presentation: { kind: 'feature', featureTypeLabels: ['Rune Knight Rune'] },
    })
    expect(result[0]?.searchText).toContain('Rune Knight Rune')
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
    expect(result[0]?.availability).toBe('retained')
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

  test('switches a subclass replacement choice with the optional-feature toggle', () => {
    const original = choice({
      id: 'original',
      label: "Ranger's Companion",
      owner: {
        type: 'subclass',
        name: 'Ranger',
        source: 'PHB',
        subclassName: 'Beast Master',
        subclassSource: 'PHB',
        featureName: "Ranger's Companion",
      },
    })
    const variant = choice({
      id: 'variant',
      label: 'Primal Companion',
      owner: {
        type: 'subclass',
        name: 'Ranger',
        source: 'PHB',
        subclassName: 'Beast Master',
        subclassSource: 'PHB',
        featureName: 'Primal Companion',
      },
      featureVariant: { replacesFeatureName: "Ranger's Companion" },
    })
    const subclass = {
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [original, variant],
        choiceDiagnostics: [],
      },
    }

    expect(getCharacterClassChoices({}, subclass, false)).toEqual([original])
    expect(getCharacterClassChoices({}, subclass, true)).toEqual([variant])
  })

  test('switches a class replacement choice with the optional-feature toggle', () => {
    const original = choice({
      id: 'original',
      label: 'Original Feature',
      owner: { type: 'class', name: 'Any', source: 'PHB', featureName: 'Original Feature' },
    })
    const variant = choice({
      id: 'variant',
      label: 'Replacement Feature',
      owner: { type: 'class', name: 'Any', source: 'PHB', featureName: 'Replacement Feature' },
      featureVariant: { replacesFeatureName: 'Original Feature' },
    })
    const classData = {
      normalizedRules: { choices: [original, variant] },
    }

    expect(getCharacterClassChoices(classData, undefined, false)).toEqual([original])
    expect(getCharacterClassChoices(classData, undefined, true)).toEqual([variant])
  })

  test('switches replacement diagnostics with the optional-feature toggle', () => {
    const original = {
      code: 'unresolved-options' as const,
      className: 'Ranger',
      classSource: 'PHB',
      subclassName: 'Beast Master',
      subclassSource: 'PHB',
      featureName: "Ranger's Companion",
      level: 3,
      message: 'Original diagnostic.',
    }
    const variant = {
      ...original,
      featureName: 'Primal Companion',
      message: 'Variant diagnostic.',
      featureVariant: { replacesFeatureName: "Ranger's Companion" },
    }
    const subclass = {
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [],
        choiceDiagnostics: [original, variant],
      },
    }

    expect(getCharacterClassChoiceDiagnostics({}, subclass, false)).toEqual([original])
    expect(getCharacterClassChoiceDiagnostics({}, subclass, true)).toEqual([variant])
  })
})
