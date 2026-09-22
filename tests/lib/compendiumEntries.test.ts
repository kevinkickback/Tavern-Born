import { describe, expect, test } from 'vitest'
import type { CompendiumEntry } from '@/lib/compendiumEntries'
import { buildCompendiumEntries, filterCompendiumEntries } from '@/lib/compendiumEntries'
import type { Spell5e } from '@/types/5etools'

describe('compendiumEntries', () => {
  test('buildCompendiumEntries flattens multiple game data families', () => {
    const entries = buildCompendiumEntries({
      races: { elf: { name: 'Elf', source: 'PHB', entries: ['race text'] } },
      classes: {
        wizard: {
          name: 'Wizard',
          source: 'PHB',
          fluff: { entries: ['class text'] },
        },
      },
      spells: {
        mm: { name: 'Magic Missile', source: 'PHB', level: 1, school: 'E' } as unknown as Spell5e,
      },
      items: [{ name: 'Rope', source: 'PHB', type: 'G', entries: ['item text'] }],
    })

    expect(entries.map((e) => `${e.type}:${e.name}`)).toEqual([
      'Race:Elf',
      'Class:Wizard',
      'Spell:Magic Missile',
      'Item:Rope',
    ])
  })

  test('buildCompendiumEntries supports array collections for primary families', () => {
    const entries = buildCompendiumEntries({
      races: [{ name: 'Elf', source: 'PHB', entries: ['race text'] }],
      classes: [
        {
          name: 'Wizard',
          source: 'PHB',
          fluff: { entries: ['class text'] },
        },
      ],
      spells: [
        { name: 'Magic Missile', source: 'PHB', level: 1, school: 'E' } as unknown as Spell5e,
      ],
      backgrounds: [{ name: 'Acolyte', source: 'PHB', entries: ['background text'] }],
    })

    expect(entries.map((e) => `${e.type}:${e.name}`)).toEqual([
      'Race:Elf',
      'Class:Wizard',
      'Spell:Magic Missile',
      'Background:Acolyte',
    ])
  })

  test('indexes curated user-facing references without exposing implementation collections', () => {
    const entries = buildCompendiumEntries({
      items: [{ name: 'Longsword', source: 'PHB', type: 'M' }],
      itemsBase: [
        { name: 'Longsword', source: 'PHB', type: 'M' },
        { name: 'War Pick', source: 'XPHB', type: 'M|XPHB' },
      ],
      itemProperties: [
        {
          abbreviation: 'V',
          source: 'PHB',
          entries: [{ type: 'entries', name: 'Versatile', entries: ['Property details.'] }],
        },
      ],
      itemTypes: [
        { abbreviation: 'M', name: 'Martial Melee Weapon', source: 'PHB' },
        { abbreviation: 'M', name: 'Martial Melee Weapon', source: 'XPHB' },
      ],
      itemMasteries: [{ name: 'Cleave', source: 'XPHB', entries: ['Mastery details.'] }],
      classFeatures: [
        { name: 'Second Wind', source: 'XPHB', className: 'Fighter', entries: ['Feature text.'] },
      ],
      organizations: [
        { name: 'The Harpers', source: 'SCAG', description: 'A covert organization.' },
      ],
    })

    expect(entries.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      'Item:Longsword',
      'Item:War Pick',
      'Item Property:Versatile',
      'Weapon Mastery:Cleave',
      'Organization:The Harpers',
    ])
    expect(
      entries.filter((entry) => entry.type === 'Item' && entry.name === 'Longsword'),
    ).toHaveLength(1)
  })

  test('indexes creature stat blocks and context-qualified subclass features', () => {
    const hunterOption = {
      name: 'Colossus Slayer',
      source: 'PHB',
      className: 'Ranger',
      classSource: 'PHB',
      subclassShortName: 'Hunter',
      subclassSource: 'PHB',
      level: 3,
      entries: ['Your weapon can exploit a wounded foe.'],
    }
    const hunterChoice = {
      name: "Hunter's Prey",
      source: 'PHB',
      className: 'Ranger',
      classSource: 'PHB',
      subclassShortName: 'Hunter',
      subclassSource: 'PHB',
      level: 3,
      entries: [
        {
          type: 'options',
          entries: [{ type: 'refSubclassFeature', feature: hunterOption }],
        },
      ],
    }
    const entries = buildCompendiumEntries({
      classes: [
        {
          name: 'Ranger',
          source: 'PHB',
          subclasses: [
            {
              name: 'Hunter',
              shortName: 'Hunter',
              source: 'PHB',
              className: 'Ranger',
              classSource: 'PHB',
              subclassFeatureRefs: [
                {
                  ref: "Hunter's Prey|Ranger||Hunter||3",
                  name: "Hunter's Prey",
                  source: 'PHB',
                  className: 'Ranger',
                  subclassShortName: 'Hunter',
                  level: 3,
                  feature: hunterChoice,
                },
              ],
            },
          ],
        },
      ],
      creatures: [
        {
          name: 'Wolf',
          source: 'MM',
          size: ['M'],
          type: 'beast',
          cr: '1/4',
          trait: [{ name: 'Keen Hearing and Smell', entries: ['The wolf has advantage.'] }],
        },
      ],
    })

    expect(entries.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      'Class:Ranger',
      "Subclass Feature:Hunter's Prey",
      'Subclass Feature:Colossus Slayer',
      'Creature:Wolf',
    ])
    expect(entries.find((entry) => entry.name === 'Colossus Slayer')?.context).toBe(
      'Ranger · Hunter · Level 3',
    )
    expect(
      filterCompendiumEntries(entries, 'beast 1/4', new Set(), new Set()).map(
        (entry) => entry.name,
      ),
    ).toEqual(['Wolf'])
  })

  test('collapses exact duplicates while retaining one canonical rule per source and edition', () => {
    const repeatedClassFeatures = Array.from({ length: 120 }, (_, index) => ({
      name: 'Ability Score Improvement',
      source: index % 2 === 0 ? 'PHB' : 'XPHB',
      className: index % 2 === 0 ? 'Fighter' : 'Artificer',
      level: (index % 19) + 1,
      entries: [`${index + 1}th-level class feature.`],
    }))

    const entries = buildCompendiumEntries({
      classFeatures: repeatedClassFeatures,
      variantrules: [
        { name: 'Ability Scores', source: 'PHB', entries: ['General 2014 ability score rules.'] },
        { name: 'Ability Scores', source: 'PHB', entries: ['Duplicate imported rule.'] },
        { name: 'Ability Scores', source: 'XPHB', entries: ['General 2024 ability score rules.'] },
      ],
    })

    expect(entries.map((entry) => `${entry.type}:${entry.name}:${entry.source}`)).toEqual([
      'Variant Rule:Ability Scores:PHB',
      'Variant Rule:Ability Scores:XPHB',
    ])
  })

  test('does not traverse excluded class features or unbounded preview payloads', () => {
    const classFeature = {
      name: 'Ability Score Improvement',
      source: 'PHB',
      get entries(): never {
        throw new Error('Class feature payload should not be indexed')
      },
    }
    const itemEntries = [
      'First useful summary entry with enough detail for the result list.',
      'Second summary candidate.',
      'Third summary candidate.',
      'Fourth summary candidate.',
    ]
    Object.defineProperty(itemEntries, 4, {
      get: () => {
        throw new Error('Preview extraction exceeded its bounded candidate count')
      },
    })
    itemEntries.length = 5

    expect(() =>
      buildCompendiumEntries({
        classFeatures: [classFeature],
        items: [{ name: 'Bounded Item', source: 'PHB', type: 'G', entries: itemEntries }],
      }),
    ).not.toThrow()
  })

  test('turns internal item references and type codes into readable summaries', () => {
    const entries = buildCompendiumEntries({
      items: [
        {
          name: 'Ioun Stone, Absorption',
          source: 'XDMG',
          type: 'WD|XDMG',
          entries: [
            '{#itemEntry Ioun Stone|XDMG}',
            'While this stone orbits your head, you can cancel a spell.',
          ],
        },
        { name: 'Golden Idol', source: 'XDMG', type: '$A|XDMG' },
      ],
      itemTypes: [
        { abbreviation: 'WD', name: 'Wand', source: 'XDMG' },
        { abbreviation: '$A', name: 'Treasure (Art Object)', source: 'XDMG' },
      ],
    })

    expect(entries.find((entry) => entry.name === 'Ioun Stone, Absorption')?.description).toBe(
      'While this stone orbits your head, you can cancel a spell.',
    )
    expect(entries.find((entry) => entry.name === 'Golden Idol')?.description).toBe(
      'Treasure (Art Object)',
    )
    expect(entries.map((entry) => entry.description).join(' ')).not.toMatch(/\{#|\$A\|XDMG/)
  })

  test('filterCompendiumEntries filters by type, source, and text query', () => {
    const entries = [
      {
        name: 'Elf',
        type: 'Race',
        source: 'PHB',
        data: {},
      },
      {
        name: 'Magic Missile',
        type: 'Spell',
        source: 'PHB',
        data: {},
      },
      {
        name: 'Mordenkainen',
        type: 'Deity',
        source: 'XGE',
        data: {},
      },
    ]

    const filtered = filterCompendiumEntries(
      entries as CompendiumEntry[],
      'magic',
      new Set(['Spell']),
      new Set(['PHB']),
    )

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.name).toBe('Magic Missile')
  })

  test('filterCompendiumEntries ignores unrelated deep payload text', () => {
    const entries = buildCompendiumEntries({
      classes: [
        {
          name: 'Wizard',
          source: 'PHB',
          fluff: { entries: ['Arcane scholar'] },
        },
      ],
      items: [
        {
          name: 'Longsword',
          source: 'PHB',
          type: 'weapon',
          entries: ['Martial melee weapon'],
          metadata: {
            unrelated: ['wizard', 'spellbook'],
          },
        },
      ],
    })

    const filtered = filterCompendiumEntries(entries, 'wizard', new Set(), new Set())

    expect(filtered.map((entry) => entry.name)).toEqual(['Wizard'])
  })

  test('filterCompendiumEntries filters entries by rules edition', () => {
    const entries = [
      {
        id: 'class|phb|legacy fighter|',
        name: 'Legacy Fighter',
        type: 'Class',
        source: 'PHB',
        data: {},
      },
      {
        id: 'class|xphb|revised fighter|',
        name: 'Revised Fighter',
        type: 'Class',
        source: 'XPHB',
        data: { edition: 'one' },
      },
      {
        id: 'class|efa|revised artificer|',
        name: 'Revised Artificer',
        type: 'Class',
        source: 'EFA',
        data: { edition: 'one' },
      },
    ] as CompendiumEntry[]

    expect(filterCompendiumEntries(entries, '', new Set(), new Set(), '5e')).toEqual([entries[0]])
    expect(filterCompendiumEntries(entries, '', new Set(), new Set(), '5.5e')).toEqual([
      entries[2],
      entries[1],
    ])
    expect(filterCompendiumEntries(entries, '', new Set(), new Set(), 'both')).toHaveLength(3)
  })

  test('classifies all revised core rulebook sources as 5.5e', () => {
    const entries = [
      {
        id: 'item|dmg|legacy item|',
        name: 'Legacy Item',
        type: 'Item',
        source: 'DMG',
        data: {},
      },
      {
        id: 'item|xdmg|revised item|',
        name: 'Revised Item',
        type: 'Item',
        source: 'XDMG',
        data: {},
      },
      {
        id: 'condition|xmm|revised condition|',
        name: 'Revised Condition',
        type: 'Condition',
        source: 'XMM',
        data: {},
      },
    ] as CompendiumEntry[]

    expect(
      filterCompendiumEntries(entries, '', new Set(), new Set(), '5.5e').map((entry) => entry.name),
    ).toEqual(['Revised Condition', 'Revised Item'])
  })

  test('edition filtering composes with type, source, and text filters', () => {
    const entries = [
      {
        id: 'class|phb|legacy fighter|',
        name: 'Legacy Fighter',
        type: 'Class',
        source: 'PHB',
        data: {},
      },
      {
        id: 'class|xphb|revised fighter|',
        name: 'Revised Fighter',
        type: 'Class',
        source: 'XPHB',
        data: { edition: 'one' },
      },
      {
        id: 'class|xphb|revised wizard|',
        name: 'Revised Wizard',
        type: 'Class',
        source: 'XPHB',
        data: { edition: 'one' },
      },
    ] as CompendiumEntry[]

    const filtered = filterCompendiumEntries(
      entries,
      'fighter',
      new Set(['Class']),
      new Set(['XPHB']),
      '5.5e',
    )

    expect(filtered.map((entry) => entry.name)).toEqual(['Revised Fighter'])
  })
})
