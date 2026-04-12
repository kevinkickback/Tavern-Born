import { describe, expect, test } from 'vitest'
import {
  buildSourcesList,
  extractProficiencyBlockNames,
  parseClasses,
  parseClassFeatures,
  parseItems,
  parseRaces,
  parseSpells,
} from '@/lib/5etools/parsers'

describe('5etools/parsers', () => {
  test('parseRaces nests subraces by race name and source', () => {
    const races = parseRaces({
      race: [{ name: 'Elf', source: 'PHB' }],
      subrace: [{ name: 'High Elf', raceName: 'Elf', raceSource: 'PHB' }],
    }) as Array<{ subraces?: Array<{ name: string }> }>

    expect(races[0]?.subraces?.map((s) => s.name)).toEqual(['High Elf'])
  })

  test('parseRaces names unnamed base subraces as Default', () => {
    const races = parseRaces({
      race: [{ name: 'Human', source: 'PHB' }],
      subrace: [{ raceName: 'Human', raceSource: 'PHB', source: 'PHB' }],
    }) as Array<{ subraces?: Array<{ name: string }> }>

    expect(races[0]?.subraces?.map((s) => s.name)).toEqual(['Default'])
  })

  test('parseClasses nests subclasses and resolves intro entries + level features', () => {
    const parsed = parseClasses({
      classFeature: [
        {
          name: 'Arcane Recovery',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          entries: ['feature text'],
        },
        {
          name: 'Arcane Tradition',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 2,
          entries: ['pick a subclass'],
        },
      ],
      class: [
        {
          name: 'Wizard',
          source: 'PHB',
          classFeatures: [
            'Arcane Recovery|Wizard||1',
            {
              classFeature: 'Arcane Tradition|Wizard||2',
              gainSubclassFeature: true,
            },
          ],
        },
      ],
      subclass: [
        {
          name: 'School of Abjuration',
          shortName: 'Abjuration',
          className: 'Wizard',
          classSource: 'PHB',
          source: 'PHB',
          subclassFeatures: ['Arcane Ward|Wizard||Abjuration||2'],
        },
      ],
      subclassFeature: [
        {
          name: 'School of Abjuration',
          subclassShortName: 'Abjuration',
          className: 'Wizard',
          classSource: 'PHB',
          entries: ['intro text'],
        },
        {
          name: 'Arcane Ward',
          subclassShortName: 'Abjuration',
          className: 'Wizard',
          classSource: 'PHB',
          level: 2,
          entries: ['feature text'],
        },
      ],
    }) as Array<{
      subclasses?: Array<{
        shortName: string
        entries: unknown[]
        levelFeatures: Array<{ level: number; features: unknown[] }>
        subclassFeatureRefs?: Array<{
          name: string
          level?: number
          feature?: { entries?: unknown[] }
        }>
      }>
      classFeatureRefs?: Array<{
        name: string
        source?: string
        level?: number
        gainSubclassFeature?: boolean
        feature?: { entries?: unknown[] }
      }>
      isSpellcaster?: boolean
    }>

    const subclass = parsed[0]?.subclasses?.[0]
    expect(subclass?.shortName).toBe('Abjuration')
    expect(subclass?.entries).toEqual(['intro text'])
    expect(subclass?.levelFeatures?.some((l) => l.level === 2)).toBe(true)
    expect(subclass?.subclassFeatureRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Arcane Ward',
          level: 2,
          feature: expect.objectContaining({ entries: ['feature text'] }),
        }),
      ]),
    )
    expect(parsed[0]?.classFeatureRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Arcane Recovery',
          source: 'PHB',
          level: 1,
          feature: expect.objectContaining({ entries: ['feature text'] }),
        }),
        expect.objectContaining({
          name: 'Arcane Tradition',
          source: 'PHB',
          level: 2,
          gainSubclassFeature: true,
        }),
      ]),
    )
    expect(parsed[0]?.isSpellcaster).toBe(false)
  })

  test('parseItems combines item, itemGroup, and baseitem arrays', () => {
    const items = parseItems({
      item: [{ name: 'Rope' }],
      itemGroup: [{ name: 'Pack' }],
      baseitem: [{ name: 'Longsword' }],
    }) as Array<{ name: string }>

    expect(items.map((i) => i.name)).toEqual(['Rope', 'Pack', 'Longsword'])
  })

  test('extractProficiencyBlockNames includes fixed keys, anyStandard, and choose count', () => {
    const names = extractProficiencyBlockNames([
      {
        common: true,
        choose: { count: 2 },
        anyStandard: 1,
      },
    ])

    expect(names).toContain('common')
    expect(names).toContain('choose 2')
    expect(names).toContain('any 1 standard')
  })

  test('buildSourcesList builds and sorts core sources with PHB before DMG', () => {
    const list = buildSourcesList(['DMG', 'XPHB'], {
      book: [
        { id: 'DMG', name: 'Dungeon Master Guide', group: 'core' },
        { id: 'XPHB', name: 'Players Handbook', group: 'core' },
      ],
    })

    expect(list.map((s) => s.abbreviation)).toEqual(['XPHB', 'DMG'])
  })

  test('parseSpells enriches classes and subclasses from generated lookup', () => {
    const spells = parseSpells(
      {
        spell: [{ name: 'Magic Missile', source: 'PHB', level: 1, school: 'E' }],
      },
      {
        sourceLookup: {
          phb: {
            'magic missile': {
              class: {
                PHB: {
                  Wizard: true,
                  Artificer: { definedInSource: 'TCE' },
                },
              },
              subclass: {
                PHB: {
                  Wizard: {
                    PHB: {
                      Evoker: { name: 'School of Evocation' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ) as Array<{
      classes?: {
        fromClassList?: Array<{
          name: string
          source: string
          definedInSource?: string
        }>
        fromSubclass?: Array<{
          class: { name: string; source: string }
          subclass: { name: string; shortName: string; source: string }
        }>
      }
    }>

    expect(spells[0]?.classes?.fromClassList).toEqual(
      expect.arrayContaining([
        { name: 'Wizard', source: 'PHB' },
        { name: 'Artificer', source: 'PHB', definedInSource: 'TCE' },
      ]),
    )
    expect(spells[0]?.classes?.fromSubclass).toEqual(
      expect.arrayContaining([
        {
          class: { name: 'Wizard', source: 'PHB' },
          subclass: {
            name: 'School of Evocation',
            shortName: 'Evoker',
            source: 'PHB',
          },
        },
      ]),
    )
  })

  test('parseClassFeatures resolves refSubclassFeature entries with parsed feature data', () => {
    const data = {
      classFeature: [
        {
          name: 'Arcane Tradition',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 2,
          entries: [
            'You focus your arcane study.',
            {
              type: 'refSubclassFeature',
              subclassFeature: 'Arcane Ward|Wizard||Abjuration|PHB|2',
            },
          ],
        },
      ],
      subclassFeature: [
        {
          name: 'Arcane Ward',
          subclassShortName: 'Abjuration',
          className: 'Wizard',
          classSource: 'PHB',
          source: 'PHB',
          level: 2,
          entries: ['You can weave magic around yourself for protection.'],
        },
      ],
    }

    const features = parseClassFeatures(data) as Array<{
      name: string
      entries: unknown[]
    }>

    const arcTrad = features.find((f) => f.name === 'Arcane Tradition')
    expect(arcTrad).toBeTruthy()
    const ref = arcTrad?.entries.find(
      (e) => typeof e === 'object' && (e as { type?: string }).type === 'refSubclassFeature',
    ) as { feature?: { entries?: unknown[] } } | undefined
    expect(ref?.feature?.entries).toEqual(['You can weave magic around yourself for protection.'])
  })

  test('parseClassFeatures leaves entries unchanged when no subclassFeature records exist', () => {
    const data = {
      classFeature: [
        {
          name: 'Sneak Attack',
          source: 'PHB',
          className: 'Rogue',
          level: 1,
          entries: ['Once per turn, you can deal extra damage.'],
        },
      ],
    }
    const features = parseClassFeatures(data) as Array<{
      name: string
      entries: unknown[]
    }>
    expect(features[0]?.entries).toEqual(['Once per turn, you can deal extra damage.'])
  })

  test('parseRaces expands simple _versions into subraces', () => {
    const races = parseRaces({
      race: [
        {
          name: 'Elf',
          source: 'XPHB',
          entries: [
            { name: 'Darkvision', type: 'entries', entries: ['60 ft.'] },
            { name: 'Elven Lineage', type: 'entries', entries: ['Choose a lineage.'] },
          ],
          _versions: [
            {
              name: 'Elf; Drow Lineage',
              source: 'XPHB',
              darkvision: 120,
              additionalSpells: [{ known: { 1: ['dancing lights|xphb#c'] } }],
              _mod: {
                entries: {
                  mode: 'replaceArr',
                  replace: 'Elven Lineage',
                  items: { name: 'Elven Lineage (Drow)', type: 'entries', entries: ['Drow text'] },
                },
              },
            },
            {
              name: 'Elf; High Elf Lineage',
              source: 'XPHB',
              _mod: {
                entries: {
                  mode: 'replaceArr',
                  replace: 'Elven Lineage',
                  items: {
                    name: 'Elven Lineage (High Elf)',
                    type: 'entries',
                    entries: ['High Elf text'],
                  },
                },
              },
            },
          ],
        },
      ],
    }) as Array<{
      name: string
      subraces?: Array<{
        name: string
        source?: string
        darkvision?: number
        additionalSpells?: unknown[]
        _isVersion?: boolean
        entries?: unknown[]
      }>
    }>

    expect(races).toHaveLength(1)
    const elf = races[0]
    expect(elf.subraces).toHaveLength(2)
    expect(elf.subraces?.[0]?.name).toBe('Drow Lineage')
    expect(elf.subraces?.[0]?.darkvision).toBe(120)
    expect(elf.subraces?.[0]?.additionalSpells).toBeDefined()
    expect(elf.subraces?.[0]?._isVersion).toBe(true)
    expect(elf.subraces?.[1]?.name).toBe('High Elf Lineage')

    // Verify _mod was applied: Elven Lineage replaced with Drow-specific entry
    const drowEntries = elf.subraces?.[0]?.entries as Array<{ name?: string }>
    expect(drowEntries?.some((e) => e.name === 'Elven Lineage (Drow)')).toBe(true)
    expect(drowEntries?.some((e) => e.name === 'Elven Lineage')).toBe(false)
  })

  test('parseRaces expands template _versions with variable substitution', () => {
    const races = parseRaces({
      race: [
        {
          name: 'Dragonborn',
          source: 'XPHB',
          entries: [
            { name: 'Draconic Ancestry', type: 'entries', entries: ['Choose ancestry.'] },
            { name: 'Breath Weapon', type: 'entries', entries: ['You exhale {{damageType}}.'] },
          ],
          _versions: [
            {
              _abstract: {
                name: 'Dragonborn ({{color}})',
                source: 'XPHB',
                _mod: {
                  entries: [
                    { mode: 'removeArr', names: ['Draconic Ancestry'] },
                    {
                      mode: 'replaceArr',
                      replace: 'Breath Weapon',
                      items: {
                        name: 'Breath Weapon',
                        type: 'entries',
                        entries: ['You exhale {{damageType}} energy.'],
                      },
                    },
                  ],
                },
              },
              _implementations: [
                { _variables: { color: 'Black', damageType: 'Acid' }, resist: ['acid'] },
                { _variables: { color: 'Red', damageType: 'Fire' }, resist: ['fire'] },
              ],
            },
          ],
        },
      ],
    }) as Array<{
      subraces?: Array<{
        name: string
        resist?: string[]
        _isVersion?: boolean
        entries?: unknown[]
      }>
    }>

    const db = races[0]
    expect(db.subraces).toHaveLength(2)
    expect(db.subraces?.[0]?.name).toBe('Black')
    expect(db.subraces?.[0]?.resist).toEqual(['acid'])
    expect(db.subraces?.[0]?._isVersion).toBe(true)
    expect(db.subraces?.[1]?.name).toBe('Red')
    expect(db.subraces?.[1]?.resist).toEqual(['fire'])

    // Verify removeArr removed Draconic Ancestry
    const blackEntries = db.subraces?.[0]?.entries as Array<{ name?: string }>
    expect(blackEntries?.some((e) => e.name === 'Draconic Ancestry')).toBe(false)

    // Verify variable substitution in replacement text
    const breathWeapon = blackEntries?.find((e) => e.name === 'Breath Weapon') as {
      entries?: string[]
    }
    expect(breathWeapon?.entries?.[0]).toBe('You exhale Acid energy.')
  })

  test('parseRaces combines subrace entries with _versions', () => {
    const races = parseRaces({
      race: [{ name: 'Elf', source: 'PHB', entries: [] }],
      subrace: [{ name: 'High Elf', raceName: 'Elf', raceSource: 'PHB' }],
    }) as Array<{ subraces?: Array<{ name: string }> }>

    // Standard subraces still work
    expect(races[0]?.subraces?.map((s) => s.name)).toEqual(['High Elf'])
  })

  test('parseRaces handles race with no subraces and no _versions', () => {
    const races = parseRaces({
      race: [{ name: 'Human', source: 'PHB' }],
    }) as Array<{ subraces?: unknown[] }>

    expect(races[0]?.subraces).toBeUndefined()
  })
})
