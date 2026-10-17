import { describe, expect, test } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { getItemRulesEntries } from '@/lib/5etools/itemTypeEntries'
import { associatePrimaryItemTypes, primaryItemTypeIdentity } from '@/lib/5etools/primaryItemTypes'
import { buildCompendiumEntries } from '@/lib/compendiumEntries'
import { renderEntriesToText } from '@/lib/entryText'
import { buildRecursiveLookup, getRecursiveTooltipData } from '@/lib/renderer/recursiveTooltip'
import type { Item5e } from '@/types/5etools'
import { instrumentRules, loadItemTypeText, lute } from '../../fixtures/itemTypeTextFixtures'

const instrument = {
  abbreviation: 'INS',
  source: 'PHB',
  name: 'Instrument',
  entries: ['Standard instrument rules.'],
}
const ship = {
  abbreviation: 'SHP',
  source: 'DMG',
  name: 'Vehicle (Water)',
  entries: ['Original ship rules.'],
}
const air = {
  abbreviation: 'AIR',
  source: 'DMG',
  name: 'Vehicle (Air)',
  _copy: { abbreviation: 'SHP', source: 'DMG' },
}
const prose = (item: Item5e | undefined) => renderEntriesToText(getItemRulesEntries(item))
const load = (types: unknown, items: Item5e[] = [lute], support: unknown = []) =>
  loadItemTypeText(items, support, types)

describe('exact primary item-type descriptions', () => {
  test('uses normalized abbreviation/default PHB independently of concrete printing and display name', async () => {
    const data = await load(
      [instrument],
      [
        { ...lute, source: 'DMG', type: ' ins ' },
        { ...lute, source: 'FRHoF', type: 'INS|PHB' },
        { ...lute, type: 'ins| ' },
      ],
    )
    for (const item of data.items)
      expect(prose(item)).toBe('Instrument (PHB) Standard instrument rules.')
    expect(primaryItemTypeIdentity({ ...instrument, name: 'Renamed' })).toBe(
      primaryItemTypeIdentity(instrument),
    )
    expect(primaryItemTypeIdentity({ abbreviation: ' ins ', source: ' ' })).toBe(
      primaryItemTypeIdentity(instrument),
    )
    expect(primaryItemTypeIdentity({ ...instrument, source: 4 })).toBeUndefined()
    for (const wrong of [
      { ...instrument, abbreviation: 'GS' },
      { ...instrument, source: 'XPHB' },
    ])
      expect(prose((await load([wrong])).items[0])).toBe('')
    expect(prose((await load([instrument], [{ ...lute, type: 'INS|XPHB' }])).items[0])).toBe('')
    expect(prose((await load([instrument])).items[0])).toContain('Standard instrument rules.')
  })

  test('keeps primary metadata intrinsic and supplements optional without creating books', async () => {
    const data = await load(
      [instrument],
      [{ ...lute, entries: ['Own.'], additionalEntries: ['Extra.'] }],
      [instrumentRules],
    )
    const item = data.items[0]
    for (const allowedSources of [undefined, [], ['XGE']]) {
      const text = renderEntriesToText(
        getItemRulesEntries(item, { allowedSources, originSystem: '2024' }),
      )
      expect(text).toContain('Own. Extra. Instrument (PHB) Standard instrument rules.')
      expect(text.includes('Instrument category guidance.')).toBe(
        allowedSources === undefined || allowedSources.includes('XGE'),
      )
    }
    const dmg = await load(
      [{ ...instrument, source: 'DMG' }],
      [{ ...lute, source: 'DMG', type: 'INS|DMG', srd: true }],
    )
    expect(
      renderEntriesToText(
        getItemRulesEntries(dmg.items[0], { allowedSources: [], originSystem: '2024' }),
      ),
    ).toContain('Instrument (DMG)')
    expect(dmg.sources.map((book) => book.abbreviation)).toEqual(['DMG'])
    expect(
      (await load([{ ...instrument, source: 'ONLY' }])).sources.map((book) => book.abbreviation),
    ).not.toContain('ONLY')
    expect(JSON.stringify(item)).not.toContain('primaryItemTypeDiagnostics')
  })

  test('limits SHP legacy alias to omitted/blank source, exact DMG and absent identifiable PHB', async () => {
    const revised = { ...ship, source: 'XPHB', entries: ['Revised ship rules.'] }
    const items = ['SHP', 'shp| ', 'SHP|PHB', 'SHP|OTHER', 'SHP|DMG'].map((type) => ({
      ...lute,
      type,
    }))
    const data = await load([ship, revised], items)
    expect(data.items.map(prose)).toEqual([
      'Vehicle (Water) (DMG) Original ship rules.',
      'Vehicle (Water) (DMG) Original ship rules.',
      '',
      '',
      'Vehicle (Water) (DMG) Original ship rules.',
    ])
    for (const phb of [
      [{ ...ship, source: 'PHB', entries: [] }],
      [{ ...ship, source: 'PHB', entries: 'malformed' }],
      [
        { ...ship, source: 'PHB' },
        { ...ship, source: 'PHB' },
      ],
    ]) {
      const blocked = await load([ship, revised, ...phb], items)
      expect(prose(blocked.items[0])).not.toContain('Original ship rules.')
      expect(blocked.items[0].primaryItemTypeText?.source).toBe('PHB')
    }
    expect(prose((await load([revised], items)).items[0])).toBe('')
    const duplicate = await load([ship, ship, revised], items)
    expect(prose(duplicate.items[0])).toContain('[Item type rules unavailable]')
    expect(prose(duplicate.items[0])).not.toContain('Revised ship rules.')
    const supplements = await load(
      [ship],
      [items[0]],
      [{ ...instrumentRules, appliesTo: 'SHP|DMG' }],
    )
    expect(prose(supplements.items[0])).not.toContain('Instrument category guidance.')
  })

  test('recomposes actual AIR parent shapes through changed, unavailable and restored exact layers', async () => {
    const items = [
      { ...lute, type: 'AIR|DMG' },
      { ...lute, name: 'Revised airship', type: 'AIR|XPHB' },
    ]
    const revised = { ...ship, source: 'XPHB', entries: ['Revised ship rules.'] }
    const revisedAir = { ...air, source: 'XPHB', _copy: { abbreviation: 'SHP', source: 'XPHB' } }
    const base = await load([ship, air, revised, revisedAir], items)
    expect(base.items.map(prose)).toEqual([
      'Vehicle (Air) (DMG) Original ship rules.',
      'Vehicle (Air) (XPHB) Revised ship rules.',
    ])
    const changed = await load(
      [{ ...ship, name: 'Renamed ship', entries: ['Changed parent.'] }],
      [],
    )
    const composed = composeGameDataLayers([base, changed])
    expect(prose(composed.items[0])).toBe('Vehicle (Air) (DMG) Changed parent.')
    expect(prose(composed.items[1])).toContain('Revised ship rules.')
    for (const entries of [[], 'bad']) {
      const unavailable = composeGameDataLayers([composed, await load([{ ...ship, entries }], [])])
      expect(prose(unavailable.items[0])).not.toContain('Changed parent.')
      expect(prose(unavailable.items[1])).toContain('Revised ship rules.')
      const restored = composeGameDataLayers([unavailable, await load([ship], [])])
      expect(prose(restored.items[0])).toContain('Original ship rules.')
    }
    expect(prose(composeGameDataLayers([base]).items[0])).toContain('Original ship rules.')
    for (const parents of [[], [revised], [ship, ship]]) {
      const absent = await load([air, ...parents], items)
      expect(prose(absent.items[0])).toContain('[Item type rules unavailable]')
      const restored = composeGameDataLayers([absent, await load([ship], [])])
      expect(prose(restored.items[0])).toContain('Original ship rules.')
    }
  })

  test('preserves empty copy overrides, isolates cycles and unsupported operations, and never accepts copy.name', async () => {
    for (const bad of [
      { ...air, _copy: { name: ship.name, source: 'DMG' } },
      { ...air, _copy: { abbreviation: 'SHP' } },
      { ...air, _copy: { abbreviation: 'AIR', source: 'DMG' } },
      { ...air, _copy: { ...air._copy, _mod: { entries: { mode: 'unsupported' } } } },
    ]) {
      const data = await load([ship, bad], [{ ...lute, type: 'AIR|DMG' }])
      expect(prose(data.items[0])).toContain('[Item type rules unavailable]')
      expect(
        createCorpusCapabilityReport(data).issues.some(
          (issue) => issue.code === 'primary-item-type-diagnostic',
        ),
      ).toBe(true)
    }
    const empty = await load([ship, { ...air, entries: [] }], [{ ...lute, type: 'AIR|DMG' }])
    expect(prose(empty.items[0])).toBe('')
    expect(empty.items[0].value).toBe(lute.value)
  })

  test('optional malformed containers and duplicate/renamed winners never reject mechanics or revive old prose', async () => {
    const base = await load([instrument])
    for (const container of [null, 42, {}, 'bad']) {
      const data = await load(container)
      expect(data.items[0].name).toBe('Lute')
      expect(prose(data.items[0])).toBe('')
      expect(data.itemTypeDiagnostics?.length).toBeGreaterThan(0)
    }
    for (const rows of [
      [{ ...instrument, name: 'Renamed', entries: [] }],
      [{ ...instrument, name: 'Renamed', entries: 42 }],
      [instrument, { ...instrument, name: 'Duplicate' }],
      [{ ...instrument, entriesTemplate: ['Unsupported'] }],
    ]) {
      const replaced = composeGameDataLayers([base, await load(rows, [])])
      expect(prose(replaced.items[0])).not.toContain('Standard instrument rules.')
      expect(prose(composeGameDataLayers([replaced, base]).items[0])).toContain(
        'Standard instrument rules.',
      )
    }
    const distinct = await load(
      [instrument, { ...instrument, abbreviation: 'GS', entries: ['Gaming rules.'] }],
      [lute, { ...lute, type: 'GS' }],
    )
    expect(distinct.itemTypes).toHaveLength(2)
    expect(distinct.items.map(prose)).toEqual([
      'Instrument (PHB) Standard instrument rules.',
      'Instrument (PHB) Gaming rules.',
    ])
  })

  test('expands shared entries in concrete item context and replaces derived metadata once', async () => {
    const data = await load([{ ...instrument, entries: ['{#itemEntry Shared|DMG}'] }])
    const fragments = [
      {
        name: 'Shared',
        source: 'DMG',
        entriesTemplate: ['For {{item.name}}.', '{@spell Light|PHB}'],
      },
    ]
    const once = associatePrimaryItemTypes(data.items, data.itemTypes, fragments)
    const twice = associatePrimaryItemTypes(once, data.itemTypes, fragments)
    expect(prose(twice[0])).toBe('Instrument (PHB) For Lute. Light')
    expect(once).toEqual(twice)
    expect(prose(associatePrimaryItemTypes(twice, [], fragments)[0])).toBe('')
    expect(prose(associatePrimaryItemTypes(twice, data.itemTypes, [])[0])).toContain(
      '[Item type rules unavailable]',
    )
    const malformed = associatePrimaryItemTypes(
      [{ ...lute, type: 'INS|PHB|extra' }],
      [instrument],
      [],
    )
    expect(malformed[0].primaryItemTypeDiagnostics).toHaveLength(1)
  })

  test('keeps summary iteration bounded while complete recursive previews retain primary tags and facts', async () => {
    const data = await load([
      { ...instrument, entries: ['{@spell Light|PHB} standard guidance.', 'Last full rule.'] },
    ])
    const item = {
      ...data.items[0],
      entries: ['First.', 'Second.', 'Third.', 'Fourth summary candidate has enough description.'],
    }
    const bounded = {
      ...item,
      get primaryItemTypeText(): never {
        throw Error('Summary eagerly accessed primary metadata')
      },
    }
    expect(buildCompendiumEntries({ items: [bounded] })[0].description).toBe(
      'Fourth summary candidate has enough description.',
    )
    const html = getRecursiveTooltipData(
      { kind: 'item', name: lute.name, source: 'PHB' },
      buildRecursiveLookup(data, { allowedSources: [], originSystem: '2024' }),
      'Lute',
    ).html
    expect(html).toContain('Last full rule.')
    expect(html).toContain('data-hover-type="spell"')
    expect(html).toContain('Value')
  })
})
