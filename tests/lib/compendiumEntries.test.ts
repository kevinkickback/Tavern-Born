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
        name: 'Legacy Fighter',
        type: 'Class',
        source: 'PHB',
        data: {},
      },
      {
        name: 'Revised Fighter',
        type: 'Class',
        source: 'XPHB',
        data: { edition: 'one' },
      },
      {
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

  test('edition filtering composes with type, source, and text filters', () => {
    const entries = [
      {
        name: 'Legacy Fighter',
        type: 'Class',
        source: 'PHB',
        data: {},
      },
      {
        name: 'Revised Fighter',
        type: 'Class',
        source: 'XPHB',
        data: { edition: 'one' },
      },
      {
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
