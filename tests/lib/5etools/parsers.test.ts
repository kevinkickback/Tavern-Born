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
})
