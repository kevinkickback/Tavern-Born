import { describe, expect, test, vi } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { expandItemEntries, parseItemEntries } from '@/lib/5etools/itemEntries'
import { ItemDataSchema } from '@/lib/5etools/schemas'
import { renderEntriesToText } from '@/lib/entryText'
import type { Item5e, ItemEntry5e } from '@/types/5etools'
import { firePotion, itemTextTypes, resistanceFragments } from '../../fixtures/itemEntryFixtures'

async function load(items: Item5e[], fragments: ItemEntry5e[]) {
  const payloads: Record<string, unknown> = {
    'items.json': { item: items },
    'items-base.json': { baseitem: [], itemType: itemTextTypes, itemEntry: fragments },
  }
  const onResourceFailure = vi.fn()
  const loader = new FiveEToolsDataLoader(
    { type: 'local', path: '/fixture', isValid: true, availableResources: Object.keys(payloads) },
    {
      type: 'local',
      readJson: async (file) => structuredClone(payloads[file]),
    },
  )
  const data = await loader.loadAllData({ deferCopyResolutionErrors: true, onResourceFailure })
  expect(onResourceFailure).not.toHaveBeenCalled()
  return data
}

describe('shared item entries', () => {
  test('honors include defaults, literal name/source conflicts and exact restoration independently of item owner', () => {
    const item = { ...firePotion, source: 'XDMG' }
    for (const uid of [
      'Potion of Resistance',
      ' Potion of Resistance | ',
      'potion of resistance|dmg',
    ]) {
      const [result] = expandItemEntries(
        [{ ...item, entries: [`{#itemEntry ${uid}}`] }],
        resistanceFragments,
      )
      expect(renderEntriesToText(result.entries)).toBe(
        'When you drink this potion, you gain resistance to fire damage for 1 hour.',
      )
      expect(result.source).toBe('XDMG')
    }
    const explicit = { ...item, entries: ['{#itemEntry Potion of Resistance|XDMG}'] }
    const [result] = expandItemEntries([explicit], resistanceFragments)
    expect(renderEntriesToText(result.entries)).toBe(
      'When you drink this potion, you have Resistance to fire damage for 1 hour.',
    )
    for (const fragments of [
      [],
      resistanceFragments.slice(0, 1),
      [{ ...resistanceFragments[1], name: 'Other' }],
    ]) {
      const [missing] = expandItemEntries([explicit], fragments)
      expect(missing.entries).toEqual(['[Item rules text unavailable]'])
      expect(missing.itemEntryDiagnostics).toHaveLength(1)
    }
    expect(expandItemEntries([explicit], resistanceFragments)[0]).toEqual(result)
  })

  test('expands nested/typed/repeated includes in item context and preserves all four macros, normal tags and input bytes', () => {
    const fragment: ItemEntry5e = {
      name: 'Detail',
      source: 'DMG',
      entriesTemplate: [
        {
          type: 'entries',
          name: 'Shared rules',
          entries: [
            '{{item.detail1}} / {{item.detail2}} / {{item.resist}} / {{getFullImmRes item.resist}}',
            '{#itemEntry Potion of Resistance}',
          ],
        },
        { type: 'table', rows: [['{@damage 1d6}', '{{item.detail1}}']] },
      ],
    }
    const item: Item5e = {
      ...firePotion,
      detail1: 'ruby',
      detail2: 'dragon',
      resist: ['fire', 'cold'],
      entries: [{ type: 'refItemEntry', itemEntry: 'Detail' }, '{#itemEntry Detail}'],
    }
    const before = JSON.stringify({ item, fragment, resistanceFragments })
    const [result] = expandItemEntries([item], [fragment, ...resistanceFragments])
    expect(result.itemEntryDiagnostics).toBeUndefined()
    expect(result.entries).toHaveLength(4)
    expect(result.entries?.[0]).toMatchObject({
      entries: [
        'ruby / dragon / fire,cold / fire, cold',
        'When you drink this potion, you gain resistance to fire,cold damage for 1 hour.',
      ],
    })
    expect(result.entries?.[1]).toEqual({ type: 'table', rows: [['{@damage 1d6}', 'ruby']] })
    expect(JSON.stringify({ item, fragment, resistanceFragments })).toBe(before)
    const all = [
      'acid',
      'bludgeoning',
      'cold',
      'fire',
      'force',
      'lightning',
      'necrotic',
      'piercing',
      'poison',
      'psychic',
      'radiant',
      'slashing',
      'thunder',
    ]
    expect(
      expandItemEntries(
        [{ ...firePotion, resist: all, entries: ['{#itemEntry Potion of Resistance|XDMG}'] }],
        resistanceFragments,
      )[0].entries,
    ).toEqual([
      'When you drink this potion, you have {@variantrule Resistance|XPHB} to all damage damage for 1 hour.',
    ])
  })

  test('distinguishes an empty fragment from ambiguous/missing/unsupported text and bounds cycles/expansion', () => {
    expect(
      expandItemEntries([firePotion], [{ ...resistanceFragments[0], entriesTemplate: [] }])[0]
        .entries,
    ).toEqual([])
    expect(
      expandItemEntries([firePotion], [resistanceFragments[0], resistanceFragments[0]])[0]
        .itemEntryDiagnostics?.[0].message,
    ).toContain('Ambiguous')
    for (const entriesTemplate of [
      ['{{item.missing}}'],
      ['{{unknown item.resist}}'],
      ['{{item.object}}'],
      ['{#itemEntry Potion of Resistance}'],
      ['{#itemEntry Potion of Resistance|DMG|extra}'],
    ]) {
      const [result] = expandItemEntries(
        [{ ...firePotion, object: {} }],
        [{ ...resistanceFragments[0], entriesTemplate }],
      )
      expect(renderEntriesToText(result.entries)).toContain('[Item rules text unavailable]')
      expect(result.itemEntryDiagnostics?.length).toBeGreaterThan(0)
    }
    const [embedded] = expandItemEntries(
      [{ ...firePotion, entries: ['Before {#itemEntry Potion of Resistance} after'] }],
      resistanceFragments,
    )
    expect(embedded.itemEntryDiagnostics?.[0].message).toContain('array slot')
    const fragments = Array.from({ length: 15 }, (_, index) => ({
      name: `Level${index}`,
      source: 'DMG',
      entriesTemplate:
        index === 14
          ? ['Leaf']
          : [`{#itemEntry Level${index + 1}}`, `{#itemEntry Level${index + 1}}`],
    }))
    const [bounded] = expandItemEntries(
      [{ ...firePotion, entries: ['{#itemEntry Level0}'] }],
      fragments,
    )
    expect(bounded.entries!.length).toBeLessThan(4096)
    expect(bounded.itemEntryDiagnostics?.some((entry) => entry.message.includes('limit'))).toBe(
      true,
    )
  })

  test('validates fragment shapes separately from tolerant runtime enrichment', () => {
    expect(parseItemEntries({ itemEntry: resistanceFragments })).toEqual(resistanceFragments)
    for (const itemEntry of [
      {},
      [{ name: 'Broken', source: 'DMG' }],
      [{ name: '', source: 'DMG', entriesTemplate: [] }],
    ]) {
      expect(ItemDataSchema.safeParse({ itemEntry }).success).toBe(false)
      expect(parseItemEntries({ itemEntry })).toEqual([])
    }
    expect(ItemDataSchema.safeParse({ itemEntry: resistanceFragments }).success).toBe(true)
  })

  test('replaces fragments by name/source when passthrough metadata is added or removed', async () => {
    const original = resistanceFragments[0]
    const metadata = { ...original, _sourceType: 'metadata', entriesTemplate: ['Updated rules.'] }
    expect(ItemDataSchema.safeParse({ itemEntry: [metadata] }).success).toBe(true)
    const base = await load([firePotion], [original])
    const changed = composeGameDataLayers([base, await load([], [metadata])])
    expect(changed.itemEntries).toEqual([metadata])
    expect(changed.items[0].entries).toEqual(['Updated rules.'])
    expect(changed.items[0].itemEntryDiagnostics).toBeUndefined()
    const restored = composeGameDataLayers([changed, await load([], [original])])
    expect(restored.itemEntries).toEqual([original])
    expect(restored.items[0].entries).toEqual(base.items[0].entries)
    expect(restored.items[0].itemEntryDiagnostics).toBeUndefined()
    const duplicate = composeGameDataLayers([restored, await load([], [original, metadata])])
    expect(duplicate.itemEntries).toHaveLength(2)
    expect(duplicate.items[0].itemEntryDiagnostics?.[0].message).toContain('Ambiguous')
    const exact = composeGameDataLayers([duplicate, await load([], [metadata])])
    expect(exact.items[0].entries).toEqual(['Updated rules.'])
    expect(exact.items[0].itemEntryDiagnostics).toBeUndefined()
  })

  test('rebuilds locally resolved copies and fragments from winning raw inputs without stale text', async () => {
    const child = {
      name: 'Copied Potion',
      source: 'HB',
      type: 'P',
      _copy: { name: firePotion.name, source: firePotion.source },
    }
    const base = await load([firePotion, child], [resistanceFragments[0]])
    expect(renderEntriesToText(base.items[1].entries)).toContain('fire damage')
    const changed = await load(
      [{ ...firePotion, resist: ['cold'] }],
      [{ ...resistanceFragments[0], entriesTemplate: ['Updated {{item.resist}} rules.'] }],
    )
    const composed = composeGameDataLayers([base, changed])
    expect(composed.items.map((item) => renderEntriesToText(item.entries))).toEqual([
      'Updated cold rules.',
      'Updated cold rules.',
    ])
    const restored = composeGameDataLayers([
      composed,
      await load([firePotion], [resistanceFragments[0]]),
    ])
    expect(restored.items.map((item) => renderEntriesToText(item.entries))).toEqual(
      Array(2).fill('When you drink this potion, you gain resistance to fire damage for 1 hour.'),
    )
    const missing = await load([firePotion], [])
    expect(createCorpusCapabilityReport(missing).issues).toMatchObject([
      {
        code: 'item-entry-diagnostic',
        collection: 'items',
        entity: 'Potion of Fire Resistance|DMG',
        path: 'entries[0]',
      },
    ])
    const exact = composeGameDataLayers([missing, await load([], [resistanceFragments[0]])])
    expect(exact.items[0].itemEntryDiagnostics).toBeUndefined()
    expect(renderEntriesToText(exact.items[0].entries)).toContain('fire damage for 1 hour')
    const cleared = composeGameDataLayers([
      exact,
      await load([], [{ ...resistanceFragments[0], entriesTemplate: [] }]),
    ])
    expect(cleared.items[0].entries).toEqual([])
    expect(base.items[1].entries).not.toEqual(composed.items[1].entries)
    expect(base.itemEntries).toHaveLength(1)
    expect(base.items).toHaveLength(2)
    const ambiguous = await load([firePotion], [resistanceFragments[0], resistanceFragments[0]])
    expect(
      composeGameDataLayers([ambiguous, await load([], [])]).items[0].itemEntryDiagnostics?.[0]
        .message,
    ).toContain('Ambiguous')
    expect(
      composeGameDataLayers([ambiguous, await load([], [resistanceFragments[0]])]).items[0]
        .itemEntryDiagnostics,
    ).toBeUndefined()
  })
})
