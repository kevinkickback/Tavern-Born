import { describe, expect, test } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { getRawItems } from '@/lib/5etools/itemEntries'
import { magicVariantIdentity, resolveMagicVariants } from '@/lib/5etools/magicVariants'
import {
  buildItemLookup,
  resolveBackgroundStartingEquipmentPackage,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { isSelectableEquipmentItem } from '@/lib/calculations/itemClassification'
import { buildCompendiumEntries } from '@/lib/compendiumEntries'
import { buildRecursiveLookup, getRecursiveTooltipData } from '@/lib/renderer/recursiveTooltip'
import type { Item5e } from '@/types/5etools'
import { loadMagicTemplates, shieldTemplate } from '../../fixtures/magicVariantFixtures'

describe('canonical magic template authority', () => {
  test('separates raw target from inherited reference owner and preserves complete names/fields', async () => {
    const parent = {
      ...shieldTemplate,
      source: 'RAW',
      inherits: { ...shieldTemplate.inherits, source: 'REF' },
    }
    const child = {
      name: 'Child',
      source: 'CHILD',
      _copy: { name: '+1 Shield (*)', source: ' raw ' },
    }
    const raw = [parent, child]
    const before = structuredClone(raw)
    const result = resolveMagicVariants(raw)
    expect(result.diagnostics).toEqual([])
    expect(result.definitions).toHaveLength(2)
    expect(result.references[0]).toMatchObject({
      name: '+1 Shield (*)',
      source: 'REF',
      type: 'GV|DMG',
      magicVariantReference: { name: '+1 Shield (*)', source: 'RAW' },
    })
    expect(result.references[1]).toMatchObject({
      name: 'Child',
      source: 'REF',
      magicVariantReference: { name: 'Child', source: 'CHILD' },
    })
    expect((await loadMagicTemplates(raw)).magicVariants).toEqual(before)
    expect(raw).toEqual(before)
    expect(magicVariantIdentity(parent)).not.toBe(
      magicVariantIdentity({ ...parent, source: 'REF' }),
    )
    expect(magicVariantIdentity({ name: 'a|b', source: 'c' })).not.toBe(
      magicVariantIdentity({ name: 'a', source: 'b|c' }),
    )
  })

  test.each([
    undefined,
    '',
    ' ',
    'REF',
    'OTHER',
  ])('does not invent copy parent source %s', (source) => {
    const result = resolveMagicVariants([
      { ...shieldTemplate, source: 'RAW', inherits: { source: 'REF' } },
      { name: 'Child', source: 'C', _copy: { name: '+1 Shield (*)', source } },
    ])
    expect(result.references.map((row) => row.name)).toEqual(['+1 Shield (*)'])
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  test.each([
    null,
    '',
    ' ',
    4,
  ])('keeps an explicit unusable inherited source unavailable: %s', (source) => {
    const result = resolveMagicVariants([
      { ...shieldTemplate, source: 'RAW', inherits: { source } },
    ])
    expect(result.references).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(
      resolveMagicVariants([{ ...shieldTemplate, source: 'RAW', inherits: {} }]).references[0]
        ?.source,
    ).toBe('RAW')
  })

  test('handles supported dotted copy mods and protected fields without mutating raw directives', () => {
    const raw = [
      { ...shieldTemplate, lootTables: ['A'], tier: 'major', srd: true },
      {
        name: 'Child',
        source: 'AU',
        _copy: {
          name: '+1 Shield (*)',
          source: 'DMG',
          _mod: {
            'inherits.source': { mode: 'setProp', value: 'AU' },
            'inherits.bonusAc': { mode: 'setProp', value: '+2' },
            'inherits.entries': { mode: 'appendArr', items: 'Child text.' },
          },
        },
        hasFluffImages: false,
      },
      {
        name: 'Grandchild',
        source: 'AU',
        _copy: {
          name: 'Child',
          source: 'AU',
          _mod: {
            'inherits.bonusAc': { mode: 'setProp', value: '+3' },
          },
        },
      },
    ]
    const before = structuredClone(raw)
    const result = resolveMagicVariants(raw)
    expect(result.diagnostics).toEqual([])
    expect(result.definitions[1]).toMatchObject({
      hasFluffImages: false,
      requires: [{ shield: true }],
      inherits: { source: 'AU', bonusAc: '+2', entries: ['Gain {=bonusAc} AC.', 'Child text.'] },
    })
    expect(result.definitions[1]).not.toHaveProperty('tier')
    expect(result.definitions[1]).not.toHaveProperty('lootTables')
    expect(result.definitions[1]).not.toHaveProperty('srd')
    expect(result.references[2]).toMatchObject({
      name: 'Grandchild',
      source: 'AU',
      bonusAc: '+3',
      entries: ['Reference shield rules.'],
    })
    expect(raw).toEqual(before)
  })

  test('diagnoses ambiguity, cycles and unsupported transforms without losing unrelated references', () => {
    const rows = [
      shieldTemplate,
      { ...shieldTemplate },
      { name: 'Dependent', source: 'D', _copy: { name: '+1 Shield (*)', source: 'DMG' } },
      { name: 'Cycle', source: 'D', _copy: { name: 'Cycle', source: 'D' } },
      {
        name: 'Unsupported',
        source: 'D',
        _copy: { name: 'Good', source: 'D', _mod: { entries: { mode: 'executeUnknown' } } },
      },
      { name: 'Good', type: 'GV', inherits: { source: 'D', entries: ['Good.'] } },
      null,
    ]
    const result = resolveMagicVariants(rows)
    expect(result.references.map((row) => row.name)).toEqual(['Good'])
    expect(result.diagnostics.map((issue) => issue.message).join(' ')).toMatch(
      /Ambiguous.*missing parent.*cycle.*unsupported/is,
    )
    expect(resolveMagicVariants(Array.from({ length: 100 }, () => null)).diagnostics).toHaveLength(
      32,
    )
  })

  test('re-resolves raw copies through overlays, unavailable winners, exact restoration and repeated cached composition', async () => {
    const child = { name: 'Child', source: 'AU', _copy: { name: '+1 Shield (*)', source: 'DMG' } }
    const base = await loadMagicTemplates([shieldTemplate, child])
    const changed = await loadMagicTemplates([{ ...shieldTemplate, entries: ['Changed.'] }])
    const invalid = await loadMagicTemplates([{ ...shieldTemplate, type: 'BAD' }])
    const combined = composeGameDataLayers([base, changed])
    expect(combined.items.find((row) => row.name === 'Child')?.entries).toEqual(['Changed.'])
    const cached = structuredClone(combined)
    expect(cached.magicVariants).toContainEqual(child)
    expect(getRawItems(cached).items).toEqual([])
    const missing = composeGameDataLayers([cached, invalid])
    expect(missing.items).toEqual([])
    expect(
      createCorpusCapabilityReport(missing).issues.some(
        (issue) => issue.code === 'magic-variant-diagnostic',
      ),
    ).toBe(true)
    const restored = composeGameDataLayers([missing, changed])
    expect(restored.items.find((row) => row.name === 'Child')?.entries).toEqual(['Changed.'])
    expect(restored.magicVariantDiagnostics).toEqual([])
    expect(composeGameDataLayers([structuredClone(restored)])).toEqual(restored)
    expect(composeGameDataLayers([base, await loadMagicTemplates([])]).magicVariants).toEqual(
      base.magicVariants,
    )
  })

  test('keeps malformed resolved parents unavailable even when a descendant repairs their fields', () => {
    const result = resolveMagicVariants([
      shieldTemplate,
      {
        name: 'Bad parent',
        source: 'AU',
        _copy: {
          name: '+1 Shield (*)',
          source: 'DMG',
          _mod: {
            'inherits.source': { mode: 'setProp', value: null },
          },
        },
      },
      {
        name: 'Repairing child',
        source: 'AU',
        _copy: {
          name: 'Bad parent',
          source: 'AU',
          _mod: {
            'inherits.source': { mode: 'setProp', value: 'AU' },
          },
        },
      },
    ])
    expect(result.references.map((row) => row.name)).toEqual(['+1 Shield (*)'])
    expect(result.definitions.map((row) => row.name)).toEqual(['+1 Shield (*)'])
    expect(result.diagnostics).toHaveLength(2)
    const delimiters = resolveMagicVariants([
      { ...shieldTemplate, name: 'a|b', source: 'c' },
      { ...shieldTemplate, name: 'a', source: 'b|c' },
      { name: 'Exact child', source: 'AU', _copy: { name: 'a|b', source: 'c' } },
    ])
    expect(delimiters.diagnostics).toEqual([])
    expect(delimiters.definitions.find((row) => row.name === 'Exact child')?.source).toBe('AU')
  })

  test.each([
    'name',
    'source',
  ])('rejects canonical %s rewrites and their dependents in either input order', (prop) => {
    const parent = {
      name: 'Changing',
      source: 'AU',
      _copy: {
        name: '+1 Shield (*)',
        source: 'DMG',
        _mod: {
          _: { mode: 'setProp', prop, value: 'Different' },
        },
      },
    }
    const child = { name: 'Dependent', source: 'AU', _copy: { name: 'Changing', source: 'AU' } }
    for (const rows of [
      [shieldTemplate, parent, child],
      [child, parent, shieldTemplate],
    ]) {
      const result = resolveMagicVariants(rows)
      expect(result.references.map((row) => row.name)).toEqual(['+1 Shield (*)'])
      expect(result.diagnostics).toHaveLength(2)
    }
    const equivalent = resolveMagicVariants([
      shieldTemplate,
      {
        ...parent,
        _copy: {
          ...parent._copy,
          _mod: { _: { mode: 'setProp', prop, value: prop === 'name' ? ' changing ' : ' au ' } },
        },
      },
    ])
    expect(equivalent.diagnostics).toEqual([])
    expect(equivalent.references).toHaveLength(2)
  })

  test('never shares copy authority between finished equipment and templates, including cache-restored references', async () => {
    const real: Item5e = { name: 'Finished', source: 'DMG', type: 'S', ac: 2 }
    const data = await loadMagicTemplates(
      [{ name: 'Template child', source: 'AU', _copy: { name: 'Finished', source: 'DMG' } }],
      [real],
    )
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject(real)
    expect(data.magicVariantDiagnostics?.[0].message).toContain('missing parent')
    const equipmentCopy = {
      name: 'Equipment child',
      source: 'AU',
      type: 'S',
      _copy: { name: '+1 Shield (*)', source: 'DMG' },
    }
    await expect(loadMagicTemplates([shieldTemplate], [equipmentCopy])).rejects.toThrow(
      'missing parent',
    )
    const referenceLayer = await loadMagicTemplates([shieldTemplate])
    const broken = await loadMagicTemplates([], [real])
    broken.items = [equipmentCopy]
    expect(() =>
      composeGameDataLayers([structuredClone(referenceLayer), structuredClone(broken)]),
    ).toThrow('missing parent')
  })

  test('adds the actual reference owning book when a copy resolves only after layering', async () => {
    const base = await loadMagicTemplates([shieldTemplate])
    const overlay = await loadMagicTemplates([
      {
        name: 'Evolved Shield',
        source: 'AU',
        _copy: {
          name: '+1 Shield (*)',
          source: 'DMG',
          _mod: { 'inherits.source': { mode: 'setProp', value: 'AU' } },
        },
      },
    ])
    expect(overlay.items).toEqual([])
    expect(overlay.sources.some((book) => book.abbreviation === 'AU')).toBe(false)
    const composed = composeGameDataLayers([base, overlay])
    expect(composed.items.find((item) => item.name === 'Evolved Shield')?.source).toBe('AU')
    expect(composed.sources.filter((book) => book.abbreviation === 'AU')).toHaveLength(1)
    expect(composeGameDataLayers([structuredClone(composed)]).sources).toEqual(composed.sources)
  })

  test('canonical suffixes and concrete-first projected tuples protect all nine historical names', async () => {
    const suffixNames = [
      '+1 Shield',
      '+2 Shield',
      '+3 Shield',
      'Arrow of Slaying',
      'Plate Armor of Etherealness',
    ]
    const pairs = suffixNames.flatMap((name) =>
      (name.startsWith('+') ? ['DMG', 'XDMG'] : ['DMG']).map((source) => ({ name, source })),
    )
    const raw = [
      ...pairs.map(({ name, source }) => ({
        name: `${name} (*)`,
        type: 'GV',
        inherits: { source },
      })),
      { name: 'Stygian Spear', type: 'GV', inherits: { source: 'CoA', entries: ['Template.'] } },
    ]
    const real = [...pairs, { name: 'Stygian Spear', source: 'CoA' }].map((row) => ({
      ...row,
      type: 'M',
      dmg1: '1d6',
      entries: ['Concrete.'],
    }))
    const data = await loadMagicTemplates(raw, real)
    expect(data.magicVariants).toEqual(raw)
    expect(data.items.filter((row) => row.magicVariantReference)).toHaveLength(8)
    expect(data.magicVariantDiagnostics).toHaveLength(1)
    expect(data.lookups?.itemLookup.get('stygian spear|coa')).toMatchObject({
      type: 'M',
      dmg1: '1d6',
    })
    expect(buildCompendiumEntries(data).filter((row) => row.name === 'Stygian Spear')).toHaveLength(
      1,
    )
    expect(
      getRecursiveTooltipData(
        { kind: 'item', name: 'Stygian Spear', source: 'CoA' },
        buildRecursiveLookup(data),
        'Item',
      ).html,
    ).toContain('Concrete.')
    expect(
      (await loadMagicTemplates(raw)).items.filter((row) => row.name === 'Stygian Spear'),
    ).toHaveLength(1)
  })

  test('suppresses duplicate projected owners and collisions after source-changing inheritance', async () => {
    const variants = ['RAW1', 'RAW2'].map((source) => ({
      ...shieldTemplate,
      source,
      inherits: { source: 'REF' },
    }))
    expect(resolveMagicVariants(variants).references).toEqual([])
    const concrete = { name: '+1 Shield (*)', source: 'REF', type: 'S', ac: 3 }
    const data = await loadMagicTemplates([variants[0]], [concrete])
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject(concrete)
    expect(data.magicVariants).toHaveLength(1)
    expect(data.magicVariantDiagnostics?.[0].message).toContain('collides')
  })

  test('retains reference prose enrichment and GV classification through shared presentation and equipment creation', async () => {
    const data = await loadMagicTemplates(
      [
        {
          name: 'Barding',
          type: 'GV|DMG',
          inherits: { source: 'PHB', type: 'TAH', entries: ['{#itemEntry Shared|DMG}'] },
        },
        {
          name: 'Template Weapon',
          type: 'GV',
          inherits: { source: 'PHB', weaponCategory: 'simple', scfType: 'arcane' },
        },
      ],
      [{ name: 'Dagger', source: 'PHB', type: 'M', weaponCategory: 'simple' }],
      {
        itemEntry: [{ name: 'Shared', source: 'DMG', entriesTemplate: ['Shared rules.'] }],
        itemType: [
          { abbreviation: 'GV', source: 'DMG', name: 'Generic variant', entries: ['Primary.'] },
        ],
      },
    )
    const barding = data.items.find((row) => row.name === 'Barding')!
    expect(barding).toMatchObject({ type: 'GV|DMG', entries: ['Shared rules.'] })
    expect(barding.primaryItemTypeText?.entries).toEqual(['Primary.'])
    expect(isSelectableEquipmentItem(barding)).toBe(false)
    const lookup = buildItemLookup(data.items)
    const selected = resolveEquipmentWithBlockChoices(
      [{ _: [{ equipmentType: 'weaponSimple' }] }],
      lookup,
      [],
    )
    expect(selected.genericChoices?.[0].candidates).toEqual([{ name: 'Dagger', source: 'PHB' }])
    const exact = resolveBackgroundStartingEquipmentPackage(
      [{ _: ['Template Weapon|PHB'] }],
      lookup,
    )
    expect(exact.items).toMatchObject([
      { name: 'Template Weapon', source: 'phb', type: 'G', _unresolved: true },
    ])
  })
})
