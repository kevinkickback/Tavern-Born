import { describe, expect, test } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import {
  associateItemTypeEntries,
  getItemRulesEntries,
  getItemTypeEntryDiagnostics,
  itemTypeEntryIdentity,
  parseItemTypeEntries,
} from '@/lib/5etools/itemTypeEntries'
import { ItemDataSchema } from '@/lib/5etools/schemas'
import { buildCompendiumEntries } from '@/lib/compendiumEntries'
import { renderEntriesToText } from '@/lib/entryText'
import { buildRecursiveLookup, getRecursiveTooltipData } from '@/lib/renderer/recursiveTooltip'
import { instrumentRules, loadItemTypeText, lute } from '../../fixtures/itemTypeTextFixtures'

const text = (item: typeof lute | undefined, allowedSources?: string[]) =>
  renderEntriesToText(getItemRulesEntries(item, { allowedSources, originSystem: '2014' }))

describe('supplemental equipment-category rules', () => {
  test('Compendium summaries stop across own and category sections while full details retain later text', () => {
    const [item] = associateItemTypeEntries(
      [{ ...lute, entries: ['First.'], additionalEntries: ['Second.'] }],
      [
        {
          ...instrumentRules,
          entries: ['Third.', 'Fourth useful candidate has enough detail for the summary result.'],
        },
        { ...instrumentRules, source: 'OTHER', entries: ['Later full-detail guidance.'] },
      ],
      [],
    )
    const later = {
      ...item.itemTypeText![1],
      get source(): never {
        throw Error('Summary visited a later category after four candidates')
      },
    }
    const bounded = { ...item, itemTypeText: [item.itemTypeText![0], later] }
    expect(buildCompendiumEntries({ items: [bounded] })[0].description).toBe(
      'Fourth useful candidate has enough detail for the summary result.',
    )
    expect(renderEntriesToText(getItemRulesEntries(item))).toContain('Later full-detail guidance.')
  })
  test('matches declared type UID independent item printing and rejects each explicit conflict', () => {
    const item = { ...lute, name: 'Horn of Blasting', source: 'DMG' }
    const [match] = associateItemTypeEntries([item], [instrumentRules], [])
    expect(text(match, ['XGE'])).toContain('Instrument category guidance.')
    for (const type of [' ins ', 'INS|', 'ins|phb'])
      expect(
        text(associateItemTypeEntries([{ ...item, type }], [instrumentRules], [])[0], ['XGE']),
      ).toContain('Instrument category guidance.')
    for (const candidate of [
      { ...instrumentRules, appliesTo: 'GS|PHB' },
      { ...instrumentRules, appliesTo: 'INS|XPHB' },
      { ...instrumentRules, source: 'OTHER' },
    ]) {
      const [missing] = associateItemTypeEntries([item], [candidate], [])
      expect(text(missing, ['XGE'])).not.toContain('Instrument category guidance.')
    }
    const [printing] = associateItemTypeEntries(
      [{ ...lute, source: 'XPHB', type: 'INS|XPHB' }],
      [instrumentRules],
      [],
    )
    expect(text(printing, ['XGE'])).toBe('')
    expect(text(associateItemTypeEntries([item], [instrumentRules], [])[0], ['XGE'])).toContain(
      'Instrument category guidance.',
    )
  })

  test('projects own arrays and independent books once, keeps source settings and compatibility explicit', () => {
    const item = {
      ...lute,
      entries: ['Own one.', 'Own two.'],
      additionalEntries: ['Own additional.'],
    }
    const rows = [
      instrumentRules,
      { ...instrumentRules, source: 'OTHER', entries: ['Other book guidance.'] },
    ]
    const [matched] = associateItemTypeEntries([item], rows, [])
    const before = JSON.stringify({ item, rows, matched })
    expect(text(matched, [])).toBe('Own one. Own two. Own additional.')
    expect(text(matched, [' XgE '])).toContain('Instrument (XGE)')
    expect(text(matched, ['XGE'])).not.toContain('Other book guidance.')
    expect(text(matched, undefined)).toContain('Other book guidance.')
    expect(text(matched, ['OTHER'])).not.toContain('Instrument category guidance.')
    expect(text(matched, ['XGE', 'OTHER']).match(/Instrument category guidance\./g)).toHaveLength(1)
    expect(
      renderEntriesToText(
        getItemRulesEntries(matched, {
          allowedSources: ['XGE'],
          originSystem: '2014',
          sourceCatalog: [
            {
              abbreviation: 'XGE',
              name: 'Later book',
              group: 'supplement',
              minimumRuleset: '2024',
            },
          ],
        }),
      ),
    ).not.toContain('Instrument category guidance.')
    expect(text(matched, ['XGE'])).toContain('Instrument category guidance.')
    expect(JSON.stringify({ item, rows, matched })).toBe(before)
  })

  test('rebuilds overlays/copies, preserves ambiguity and makes malformed winners unavailable until restored', async () => {
    const child = {
      name: 'Copied instrument',
      source: 'DMG',
      type: 'INS',
      _copy: { name: 'Lute', source: 'PHB' },
    }
    const base = await loadItemTypeText([lute, child])
    const changed = await loadItemTypeText(
      [],
      [
        {
          ...instrumentRules,
          name: 'Renamed rules',
          _sourceType: 'metadata',
          entries: ['New guidance.'],
        },
      ],
    )
    const composed = composeGameDataLayers([base, changed])
    expect(composed.itemTypeAdditionalEntries).toHaveLength(1)
    expect(composed.items.map((item) => text(item, ['XGE']))).toEqual([
      'Renamed rules (XGE) New guidance.',
      'Renamed rules (XGE) New guidance.',
    ])
    for (const rows of [
      [{ ...instrumentRules, entries: undefined }],
      [instrumentRules, { ...instrumentRules, name: 'Duplicate' }],
    ]) {
      const unavailable = composeGameDataLayers([composed, await loadItemTypeText([], rows)])
      expect(text(unavailable.items[0], ['XGE'])).toContain('[Supplemental item rules unavailable]')
      expect(text(unavailable.items[0], ['XGE'])).not.toContain('New guidance.')
      expect(
        createCorpusCapabilityReport(unavailable).issues.some(
          (issue) => issue.code === 'item-type-entry-diagnostic',
        ),
      ).toBe(true)
      const restored = composeGameDataLayers([
        unavailable,
        await loadItemTypeText([], [instrumentRules]),
      ])
      expect(text(restored.items[0], ['XGE'])).toContain('Instrument category guidance.')
      expect(restored.items[0].itemTypeText?.[0].diagnostics).toBeUndefined()
    }
    const empty = composeGameDataLayers([
      composed,
      await loadItemTypeText([], [{ ...instrumentRules, entries: [] }]),
    ])
    expect(getItemRulesEntries(empty.items[0])).toEqual([])
    expect(text((await loadItemTypeText([lute], [])).items[0], ['XGE'])).toBe('')
    expect(text(base.items[0], ['XGE'])).toContain('Instrument category guidance.')
    expect(
      itemTypeEntryIdentity({ ...instrumentRules, name: 'Other', _sourceType: 'metadata' }),
    ).toBe(itemTypeEntryIdentity(instrumentRules))
  })

  test('keeps optional container/row errors diagnostic without rejecting resource mechanics and offers source-only books', async () => {
    for (const invalid of [{}, 'invalid', 42]) {
      expect(
        ItemDataSchema.safeParse({ baseitem: [lute], itemTypeAdditionalEntries: invalid }).success,
      ).toBe(true)
      const data = await loadItemTypeText([lute], invalid)
      expect(data.items[0].name).toBe('Lute')
      expect(
        createCorpusCapabilityReport(data).issues.some(
          (issue) => issue.code === 'item-type-entry-diagnostic',
        ),
      ).toBe(true)
    }
    const rows = [
      null,
      {},
      { ...instrumentRules, source: '' },
      { ...instrumentRules, appliesTo: 'INS|PHB|extra' },
      { ...instrumentRules, _copy: { name: 'Other' } },
    ]
    expect(getItemTypeEntryDiagnostics(rows).length).toBeGreaterThan(0)
    expect(parseItemTypeEntries({ itemTypeAdditionalEntries: rows }).records).toEqual(rows)
    const data = await loadItemTypeText([lute])
    expect(data.sources.map((book) => book.abbreviation)).toEqual(
      expect.arrayContaining(['PHB', 'XGE']),
    )
    expect(data.items).toHaveLength(1)
    const revised = await loadItemTypeText(
      [lute],
      [{ ...instrumentRules, source: 'ONLY', edition: 'one' }],
    )
    expect(revised.sources.find((book) => book.abbreviation === 'ONLY')?.minimumRuleset).toBe(
      '2024',
    )
    expect(
      renderEntriesToText(
        getItemRulesEntries(revised.items[0], {
          allowedSources: ['ONLY'],
          originSystem: '2014',
          sourceCatalog: revised.sources,
        }),
      ),
    ).not.toContain('Instrument category guidance.')
    expect(
      renderEntriesToText(
        getItemRulesEntries(revised.items[0], {
          allowedSources: ['ONLY'],
          originSystem: '2024',
          sourceCatalog: revised.sources,
        }),
      ),
    ).toContain('Instrument category guidance.')
    const orphan = await loadItemTypeText(
      [lute],
      [{ ...instrumentRules, appliesTo: 'UNKNOWN|PHB' }],
    )
    expect(orphan.itemTypeAdditionalEntries).toHaveLength(1)
    expect(orphan.items[0].itemTypeText).toBeUndefined()
    expect(
      createCorpusCapabilityReport(orphan).issues.filter(
        (issue) => issue.code === 'item-type-entry-diagnostic',
      ),
    ).toEqual([])
  })

  test('item previews retain prose beyond two entries and show canonical facts without invented inventory quantity', async () => {
    const data = await loadItemTypeText([
      { ...lute, entries: ['Own one.', 'Own two.'], additionalEntries: ['Own additional.'] },
    ])
    const render = (sources: string[]) =>
      getRecursiveTooltipData(
        { kind: 'item', name: 'Lute', source: 'PHB' },
        buildRecursiveLookup(data, {
          allowedSources: sources,
          originSystem: '2014',
          sourceCatalog: data.sources,
        }),
        'Lute',
      ).html
    const enabled = render(['XGE'])
    expect(enabled).toContain('Own additional.')
    expect(enabled).toContain('Instrument category guidance.')
    expect(enabled).toContain('Value')
    expect(enabled).toContain('Weight')
    expect(enabled).not.toContain('Quantity')
    expect(render([])).not.toContain('Instrument category guidance.')
    expect(render(['XGE'])).toBe(enabled)
  })
})
