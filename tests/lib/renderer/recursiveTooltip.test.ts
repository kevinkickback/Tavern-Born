// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { parseItemProperties, parseItems, parseItemTypes } from '@/lib/5etools/parsers/basic'
import { associatePrimaryItemTypes } from '@/lib/5etools/primaryItemTypes'
import { formatProficiencyList } from '@/lib/calculations/classUtils'
import {
  buildRecursiveLookup,
  getRecursiveTooltipData,
  markRecursiveTooltipReferences,
  resolveRecursiveEntity,
} from '@/lib/renderer/recursiveTooltip'
import type { Creature5e, Item5e, Spell5e } from '@/types/5etools'

describe('class proficiency previews', () => {
  test('uses the source categories and exact base equipment from Included data', () => {
    const itemsBase = parseItems(
      JSON.parse(readFileSync('resources/srd/data/items-base.json', 'utf8')),
    ) as Item5e[]
    const getCategory = (name: string, source: string) =>
      getRecursiveTooltipData(
        { kind: 'proficiency', name, source },
        buildRecursiveLookup({ itemsBase }),
        name,
      ).html

    const simple = getCategory('simple', 'weapon')
    expect(simple).toContain('Dagger (PHB)')
    expect(simple).toContain('Dagger (XPHB)')
    expect(simple).not.toContain('Longsword')
    expect(simple).not.toContain('Wooden Staff')
    expect(getCategory('martial', 'weapon')).toContain('Longsword (XPHB)')
    expect(getCategory('light', 'armor')).toContain('Leather Armor (XPHB)')
    expect(getCategory('medium', 'armor')).toContain('Half Plate Armor (XPHB)')
    expect(getCategory('heavy', 'armor')).toContain('Plate Armor (XPHB)')
    expect(getCategory('shield', 'armor')).toContain('Shield (XPHB)')
  })

  test('preserves structured source wording and leaves qualified grants distinct', () => {
    const druid = JSON.parse(readFileSync('resources/srd/data/class/class-druid.json', 'utf8'))
    const classic = druid.class.find((row: { source: string }) => row.source === 'PHB')
    const armor = formatProficiencyList(classic.startingProficiencies.armor, 'armor')
    expect(armor).toContain('druids will not wear armor or use shields made of metal')
    expect(armor).not.toContain('data-hover-name="shield"')
    const rogue = JSON.parse(readFileSync('resources/srd/data/class/class-rogue.json', 'utf8'))
    const revised = rogue.class.find((row: { source: string }) => row.source === 'XPHB')
    const weapons = formatProficiencyList(revised.startingProficiencies.weapons, 'weapon')
    expect(weapons).toContain('Finesse or Light')
    expect(weapons).toMatch(/data-hover-type="proficiency"[^>]*>Finesse or Light</)
    expect(weapons).not.toContain('data-hover-name="martial"')
  })

  test.each([
    ['monk', 'Light', ['Hand Crossbow', 'Scimitar', 'Shortsword']],
    ['rogue', 'Finesse or Light', ['Hand Crossbow', 'Rapier', 'Scimitar', 'Shortsword', 'Whip']],
  ])('previews the Included revised %s filter using exact property definitions', (className, label, names) => {
    const document = JSON.parse(
      readFileSync(`resources/srd/data/class/class-${className}.json`, 'utf8'),
    )
    const revised = document.class.find((row: { source: string }) => row.source === 'XPHB')
    const source = JSON.parse(readFileSync('resources/srd/data/items-base.json', 'utf8'))
    const items = parseItems(source) as Item5e[]
    const missingProperty = {
      ...items.find((item) => item.name === 'Rapier' && item.source === 'XPHB')!,
      name: 'Unknown Property',
      property: ['L|UNKNOWN'],
    }
    const lookup = buildRecursiveLookup(
      composeGameDataLayers([
        {
          ...createEmptyGameData(),
          itemTypes: parseItemTypes(source),
          itemsBase: [
            ...items.filter((item) => item.source === 'XPHB'),
            missingProperty,
            { ...missingProperty, name: 'Different Property', property: ['L|HB'] },
            { ...missingProperty, name: 'Ambiguous Property', property: ['L|DUP'] },
            { ...missingProperty, name: 'Whitespace Property', property: [{ uid: ' l | xPhB ' }] },
            { ...missingProperty, name: 'Unnamed Property', property: ['LIGHT|HB'] },
            { ...missingProperty, name: 'Unknown Type', type: 'M|UNKNOWN', property: ['L|XPHB'] },
          ],
          itemProperties: [
            ...parseItemProperties(source),
            { abbreviation: 'L', source: 'HB', name: 'Long' },
            { abbreviation: 'L', source: 'DUP', name: 'Long' },
            { abbreviation: 'L', source: 'DUP', name: 'Light' },
            { abbreviation: 'LIGHT', source: 'HB' },
          ],
        },
      ]),
    )
    const formatted = formatProficiencyList(revised.startingProficiencies.weapons, 'weapon')
    const parser = new DOMParser()
    const links = [
      ...parser
        .parseFromString(formatted ?? '', 'text/html')
        .querySelectorAll<HTMLElement>('[data-hover-type="proficiency"]'),
    ]
    const trigger = links.find((link) => link.textContent === label)
    expect(trigger).toBeDefined()
    const preview = getRecursiveTooltipData(
      {
        kind: 'proficiency',
        name: trigger?.dataset.hoverName ?? '',
        source: trigger?.dataset.hoverSource,
      },
      lookup,
      label,
    )
    expect(
      [
        ...parser
          .parseFromString(preview.html ?? '', 'text/html')
          .querySelectorAll<HTMLElement>('[data-hover-type="item"]'),
      ].map((link) => [link.dataset.hoverName, link.dataset.hoverSource]),
    ).toEqual([...names, 'Whitespace Property'].sort().map((name) => [name, 'XPHB']))
  })

  test('keeps unsupported weapon filter clauses as readable text', () => {
    const html = formatProficiencyList(
      [
        '{@filter Excluded|items|type=martial weapon|property=!light}',
        '{@filter Restricted|items|type=martial weapon|property=light|source=XPHB}',
        '{@filter Empty|items|type=martial weapon|property=light;;finesse}',
      ],
      'weapon',
    )
    expect(html).toContain('Excluded')
    expect(html).toContain('Restricted')
    expect(html).toContain('Empty')
    expect(html).not.toContain('data-hover-type')
  })

  test('keeps category snapshots distinct across lookup changes and excludes ambiguous bases', () => {
    const mace: Item5e = {
      name: 'Mace',
      source: 'PHB',
      type: 'M',
      weaponCategory: 'simple',
      startingEquipmentCategory: 'Basic',
    }
    const reference = { kind: 'proficiency', name: 'simple', source: 'weapon' }
    const original = buildRecursiveLookup({ itemsBase: [mace] })
    const filtered = buildRecursiveLookup({
      itemsBase: [{ ...mace, sourceIdentityConflict: true }],
    })
    const first = getRecursiveTooltipData(reference, original, 'simple')
    const second = getRecursiveTooltipData(reference, filtered, 'simple')
    expect(first.html).toContain('Mace (PHB)')
    expect(second.html).toContain('No matching base equipment')
    expect(first.key).not.toBe(second.key)
    expect(getRecursiveTooltipData(reference, original, 'simple')).toBe(first)
  })

  test('classifies base equipment using its exact primary type definition', () => {
    const itemsBase = associatePrimaryItemTypes(
      [
        {
          name: 'Example Armor',
          source: 'HB',
          type: 'TEST|HB',
          startingEquipmentCategory: 'Basic',
        },
        { name: 'Example Gear', source: 'PHB', type: 'TEST', startingEquipmentCategory: 'Basic' },
        {
          name: 'Invalid Armor',
          source: 'PHB',
          type: 'MA|PHB|extra',
          startingEquipmentCategory: 'Basic',
        },
        {
          name: 'Ambiguous Armor',
          source: 'HB',
          type: 'MA|HB',
          startingEquipmentCategory: 'Basic',
        },
      ],
      [
        { abbreviation: 'TEST', source: 'PHB', name: 'Adventuring Gear' },
        { abbreviation: 'TEST', source: 'HB', name: 'Medium Armor' },
        { abbreviation: 'MA', source: 'HB', name: 'Medium Armor' },
        { abbreviation: 'MA', source: 'HB', name: 'Adventuring Gear' },
      ],
      [],
    )
    const preview = getRecursiveTooltipData(
      { kind: 'proficiency', name: 'medium', source: 'armor' },
      buildRecursiveLookup({ itemsBase }),
      'medium',
    )
    expect(preview.html).toContain('Example Armor (HB)')
    expect(preview.html).not.toContain('Example Gear')
    expect(preview.html).not.toContain('Invalid Armor')
    expect(preview.html).not.toContain('Ambiguous Armor')
  })

  test('keeps literal item names in generated nested links', () => {
    const item: Item5e = {
      name: 'C&copy; Armor',
      source: 'HB',
      type: 'MA',
      startingEquipmentCategory: 'Basic',
    }
    const lookup = buildRecursiveLookup({ itemsBase: [item] })
    const preview = getRecursiveTooltipData(
      { kind: 'proficiency', name: 'medium', source: 'armor' },
      lookup,
      'medium',
    )
    const html = new DOMParser().parseFromString(preview.html ?? '', 'text/html')
    const reference = html.querySelector<HTMLElement>('[data-hover-name]')
    expect(reference?.textContent).toBe('C&copy; Armor (HB)')
    expect(
      resolveRecursiveEntity(
        lookup.items,
        reference?.dataset.hoverName ?? '',
        reference?.dataset.hoverSource,
      ),
    ).toBe(item)
  })
})

describe('buildRecursiveLookup', () => {
  test('builds source-qualified and deterministic name-only maps from explicit collections', () => {
    const phbSpell = { name: 'Light', source: 'PHB', level: 0, school: 'E' } as Spell5e
    const xphbSpell = { name: 'Light', source: 'XPHB', level: 0, school: 'E' } as Spell5e
    const baseItem = { name: 'Torch', source: 'PHB', type: 'G' } as Item5e

    const lookup = buildRecursiveLookup({
      spells: [phbSpell, xphbSpell],
      itemsBase: [baseItem],
    })

    expect(lookup.spells.get('light|phb')).toBe(phbSpell)
    expect(lookup.spells.get('light|xphb')).toBe(xphbSpell)
    expect(lookup.spells.get('light|')).toBe(phbSpell)
    expect(lookup.items.get('torch|phb')).toBe(baseItem)
    expect(lookup.items.get('torch|')).toBe(baseItem)
  })

  test('uses only the collections supplied by the caller', () => {
    const lookup = buildRecursiveLookup({ feats: [{ name: 'Alert', source: 'PHB' }] })

    expect(lookup.feats.get('alert|phb')?.name).toBe('Alert')
    expect(lookup.spells.size).toBe(0)
    expect(lookup.items.size).toBe(0)
  })

  test('indexes loaded trap, hazard, and reward preview collections', () => {
    const hazard = { name: 'Extreme Cold', source: 'DMG', entries: ['Cold details.'] }
    const reward = { name: 'Blessing of Health', source: 'DMG', entries: ['Reward details.'] }
    const lookup = buildRecursiveLookup({ trapHazards: [hazard], rewards: [reward] })

    expect(
      getRecursiveTooltipData(
        { kind: 'hazard', name: 'Extreme Cold', source: 'DMG' },
        lookup,
        'Hazard: Extreme Cold',
      ).html,
    ).toContain('Cold details.')
    expect(
      getRecursiveTooltipData(
        { kind: 'reward', name: 'Blessing of Health', source: 'DMG' },
        lookup,
        'Reward: Blessing of Health',
      ).html,
    ).toContain('Reward details.')
  })

  test('resolves creature references from rendered stat blocks', () => {
    const wolf = {
      name: 'Wolf',
      source: 'MM',
      trait: [{ name: 'Pack Tactics', entries: ['Wolf details.'] }],
    } as Creature5e
    const lookup = buildRecursiveLookup({ creatures: [wolf] })

    expect(
      getRecursiveTooltipData(
        { kind: 'creature', name: 'Wolf', source: 'MM' },
        lookup,
        'Creature: Wolf',
      ),
    ).toMatchObject({
      title: 'Wolf',
      subtitle: 'Creature • MM',
      html: expect.stringContaining('Wolf details.'),
    })
  })

  test('resolves colliding class features and nested subclass features by their parent scope', () => {
    const fighterFeature = {
      name: 'Extra Attack',
      source: 'PHB',
      className: 'Fighter',
      classSource: 'PHB',
      entries: ['Fighter version.'],
    }
    const paladinFeature = {
      name: 'Extra Attack',
      source: 'PHB',
      className: 'Paladin',
      classSource: 'PHB',
      entries: ['Paladin version.'],
    }
    const arcaneWard = {
      name: 'Arcane Ward',
      source: 'PHB',
      className: 'Wizard',
      classSource: 'PHB',
      subclassShortName: 'Abjuration',
      subclassSource: 'PHB',
      entries: ['Ward details.'],
    }
    const lookup = buildRecursiveLookup({
      classFeatures: [fighterFeature, paladinFeature],
      classes: [
        {
          name: 'Wizard',
          source: 'PHB',
          subclasses: [
            {
              name: 'School of Abjuration',
              shortName: 'Abjuration',
              source: 'PHB',
              entries: ['Abjuration subclass details.'],
              levelFeatures: [{ features: [arcaneWard] }],
            },
          ],
        },
      ],
    })

    expect(
      getRecursiveTooltipData(
        {
          kind: 'subclass',
          name: 'Abjuration',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
        },
        lookup,
        'Subclass: Abjuration',
      ).html,
    ).toContain('Abjuration subclass details.')
    expect(
      getRecursiveTooltipData(
        {
          kind: 'classFeature',
          name: 'Extra Attack',
          source: 'PHB',
          className: 'Paladin',
          classSource: 'PHB',
        },
        lookup,
        'Class Feature: Extra Attack',
      ).html,
    ).toContain('Paladin version.')
    expect(
      getRecursiveTooltipData(
        {
          kind: 'subclassFeature',
          name: 'Arcane Ward',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          subclassName: 'Abjuration',
          subclassSource: 'PHB',
        },
        lookup,
        'Subclass Feature: Arcane Ward',
      ).html,
    ).toContain('Ward details.')
  })

  test('does not cross sources when a source-qualified recursive reference is unavailable', () => {
    const lookup = buildRecursiveLookup({
      spells: [{ name: 'Light', source: 'PHB', level: 0, school: 'E' } as Spell5e],
      feats: [{ name: 'Alert', source: 'PHB', entries: ['PHB feat details.'] }],
      classFeatures: [
        {
          name: 'Extra Attack',
          source: 'PHB',
          className: 'Fighter',
          classSource: 'PHB',
          entries: ['PHB class details.'],
        },
      ],
    })

    expect(
      getRecursiveTooltipData(
        { kind: 'spell', name: 'Light', source: 'XPHB' },
        lookup,
        'Spell: Light',
      ).html,
    ).toBeUndefined()
    expect(
      getRecursiveTooltipData(
        { kind: 'feat', name: 'Alert', source: 'XPHB' },
        lookup,
        'Feat: Alert',
      ).html,
    ).toBeUndefined()
    expect(
      getRecursiveTooltipData(
        {
          kind: 'classFeature',
          name: 'Extra Attack',
          source: 'XPHB',
          className: 'Fighter',
          classSource: 'PHB',
        },
        lookup,
        'Class Feature: Extra Attack',
      ).html,
    ).toBeUndefined()
  })

  test('makes entity references keyboard reachable without changing title-only annotations', () => {
    const marked = markRecursiveTooltipReferences(
      '<span title="Condition: Prone" data-hover-type="condition" data-hover-name="Prone" data-hover-source="PHB">Prone</span><span title="Book">PHB</span>',
    )

    expect(marked).toContain('data-recursive-title="Condition: Prone"')
    expect(marked).toContain('tabindex="0"')
    expect(marked).toContain('role="button"')
    expect(marked).toContain('aria-haspopup="dialog"')
    expect(marked).toContain('aria-expanded="false"')
    expect(marked).toContain('<span title="Book">PHB</span>')
  })
})
