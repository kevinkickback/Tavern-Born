import { describe, expect, test } from 'vitest'
import {
  buildItemLookup,
  formatEquipmentOptionEntries,
  getBackgroundEquipmentBlocks,
  getClassDefaultEquipmentBlocks,
  getClassStartingEquipmentChoiceOptions,
  hasClassStartingEquipmentChoice,
  resolveBackgroundStartingEquipmentPackage,
  resolveClassStartingEquipmentOptions,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import type { Item5e } from '@/types/5etools'

function makeItem(name: string, source = 'PHB', type = 'W'): Item5e {
  return { name, source, type } as Item5e
}

const EMPTY_LOOKUP = new Map<string, Item5e>()

// ---------------------------------------------------------------------------
// buildItemLookup
// ---------------------------------------------------------------------------

describe('buildItemLookup', () => {
  test('builds a keyed map from item array', () => {
    const items = [makeItem('Dagger', 'PHB'), makeItem('Handaxe', 'PHB')]
    const map = buildItemLookup(items)
    expect(map.size).toBe(2)
    expect(map.get('dagger|phb')).toBeDefined()
    expect(map.get('handaxe|phb')).toBeDefined()
  })

  test('keys are case-insensitive (lowercase)', () => {
    const map = buildItemLookup([makeItem('Shield', 'PHB')])
    expect(map.get('shield|phb')).toBeDefined()
    expect(map.get('Shield|PHB')).toBeUndefined()
  })

  test('returns empty map for empty array', () => {
    expect(buildItemLookup([]).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getClassDefaultEquipmentBlocks
// ---------------------------------------------------------------------------

describe('getClassDefaultEquipmentBlocks', () => {
  test('returns empty for null/undefined', () => {
    expect(getClassDefaultEquipmentBlocks(null)).toEqual([])
    expect(getClassDefaultEquipmentBlocks(undefined)).toEqual([])
  })

  test('returns empty for non-object (string)', () => {
    expect(getClassDefaultEquipmentBlocks('some string')).toEqual([])
  })

  test('returns defaultData array when present', () => {
    const blocks = [{ A: ['dagger|phb'] }]
    expect(getClassDefaultEquipmentBlocks({ defaultData: blocks })).toBe(blocks)
  })

  test('returns empty when defaultData is absent', () => {
    expect(getClassDefaultEquipmentBlocks({})).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getBackgroundEquipmentBlocks
// ---------------------------------------------------------------------------

describe('getBackgroundEquipmentBlocks', () => {
  test('returns the array directly when input is already an array', () => {
    const blocks = [{ _: ['dagger|phb'] }]
    expect(getBackgroundEquipmentBlocks(blocks)).toBe(blocks)
  })

  test('returns defaultData when present on object', () => {
    const blocks = [{ _: ['dagger|phb'] }]
    expect(getBackgroundEquipmentBlocks({ defaultData: blocks })).toBe(blocks)
  })

  test('wraps plain object in array', () => {
    const obj = { _: ['dagger|phb'] }
    expect(getBackgroundEquipmentBlocks(obj)).toEqual([obj])
  })

  test('returns empty for null/undefined', () => {
    expect(getBackgroundEquipmentBlocks(null)).toEqual([])
    expect(getBackgroundEquipmentBlocks(undefined)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// hasClassStartingEquipmentChoice
// ---------------------------------------------------------------------------

describe('hasClassStartingEquipmentChoice', () => {
  test('false when no starting equipment', () => {
    expect(hasClassStartingEquipmentChoice(null)).toBe(false)
  })

  test('false when blocks are empty', () => {
    expect(hasClassStartingEquipmentChoice({ defaultData: [] })).toBe(false)
  })

  test('false when block has only A (no B)', () => {
    expect(hasClassStartingEquipmentChoice({ defaultData: [{ A: ['dagger|phb'] }] })).toBe(false)
  })

  test('true when block has both A and B', () => {
    expect(
      hasClassStartingEquipmentChoice({
        defaultData: [{ A: ['dagger|phb'], B: ['handaxe|phb'] }],
      }),
    ).toBe(true)
  })

  test('true when block uses lowercase a and b keys', () => {
    expect(
      hasClassStartingEquipmentChoice({
        defaultData: [{ a: ['dagger|phb'], b: ['handaxe|phb'] }],
      }),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getClassStartingEquipmentChoiceOptions
// ---------------------------------------------------------------------------

describe('getClassStartingEquipmentChoiceOptions', () => {
  test('returns [A] when no choice exists', () => {
    expect(
      getClassStartingEquipmentChoiceOptions({ defaultData: [{ A: ['dagger|phb'] }] }),
    ).toEqual(['A'])
  })

  test('returns [A, B] when choice exists', () => {
    expect(
      getClassStartingEquipmentChoiceOptions({
        defaultData: [{ A: ['dagger|phb'], B: ['handaxe|phb'] }],
      }),
    ).toEqual(['A', 'B'])
  })
})

// ---------------------------------------------------------------------------
// resolveEquipmentWithBlockChoices
// ---------------------------------------------------------------------------

describe('resolveEquipmentWithBlockChoices', () => {
  test('resolves A choice items', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const handaxe = makeItem('Handaxe', 'PHB')
    const lookup = buildItemLookup([dagger, handaxe])

    const blocks = [{ A: ['dagger|PHB'], B: ['handaxe|PHB'] }]
    const result = resolveEquipmentWithBlockChoices(blocks, lookup, ['a'])

    expect(result.items.some((i) => i.name === 'Dagger')).toBe(true)
    expect(result.items.some((i) => i.name === 'Handaxe')).toBe(false)
  })

  test('resolves B choice items', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const handaxe = makeItem('Handaxe', 'PHB')
    const lookup = buildItemLookup([dagger, handaxe])

    const blocks = [{ A: ['dagger|PHB'], B: ['handaxe|PHB'] }]
    const result = resolveEquipmentWithBlockChoices(blocks, lookup, ['b'])

    expect(result.items.some((i) => i.name === 'Handaxe')).toBe(true)
    expect(result.items.some((i) => i.name === 'Dagger')).toBe(false)
  })

  test('always includes fixed _ items regardless of choice', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const handaxe = makeItem('Handaxe', 'PHB')
    const lookup = buildItemLookup([dagger, handaxe])

    const blocks = [{ _: ['dagger|PHB'], A: ['handaxe|PHB'] }]
    const result = resolveEquipmentWithBlockChoices(blocks, lookup, ['a'])

    expect(result.items.some((i) => i.name === 'Dagger')).toBe(true)
    expect(result.items.some((i) => i.name === 'Handaxe')).toBe(true)
  })

  test('merges duplicate items by summing quantity', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const lookup = buildItemLookup([dagger])

    const blocks = [{ _: ['dagger|PHB'] }, { _: ['dagger|PHB'] }]
    const result = resolveEquipmentWithBlockChoices(blocks, lookup, [])
    const found = result.items.find((i) => i.name === 'Dagger')

    expect(found).toBeDefined()
    expect(found?.quantity).toBe(2)
  })

  test('creates unresolved placeholder for unknown item', () => {
    const blocks = [{ A: ['nonexistent|PHB'] }]
    const result = resolveEquipmentWithBlockChoices(blocks, EMPTY_LOOKUP, ['a'])

    expect(result.items).toHaveLength(1)
    expect(result.items[0]._unresolved).toBe(true)
  })

  test('defaults to first choice key when blockChoices is empty', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const lookup = buildItemLookup([dagger])

    const blocks = [{ A: ['dagger|PHB'] }]
    const result = resolveEquipmentWithBlockChoices(blocks, lookup, [])

    expect(result.items.some((i) => i.name === 'Dagger')).toBe(true)
  })

  test('extracts gp currency from value field (cp)', () => {
    // 500 cp = 5 gp exactly
    const blocks = [{ _: [{ value: 500 }] }]
    const result = resolveEquipmentWithBlockChoices(blocks, EMPTY_LOOKUP, [])

    expect(result.currency.gp).toBe(5)
    expect(result.currency.sp).toBe(0)
    expect(result.currency.cp).toBe(0)
  })

  test('extracts mixed currency correctly', () => {
    // 157 cp = 1gp 5sp 7cp
    const blocks = [{ _: [{ value: 157 }] }]
    const result = resolveEquipmentWithBlockChoices(blocks, EMPTY_LOOKUP, [])

    expect(result.currency.gp).toBe(1)
    expect(result.currency.sp).toBe(5)
    expect(result.currency.cp).toBe(7)
  })

  test('accumulates currency across multiple blocks', () => {
    const blocks = [{ _: [{ value: 100 }] }, { _: [{ value: 100 }] }]
    const result = resolveEquipmentWithBlockChoices(blocks, EMPTY_LOOKUP, [])

    expect(result.currency.gp).toBe(2)
  })

  test('handles special entry objects', () => {
    const blocks = [{ _: [{ special: 'A holy symbol of your deity' }] }]
    const result = resolveEquipmentWithBlockChoices(blocks, EMPTY_LOOKUP, [])

    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('A holy symbol of your deity')
  })

  test('handles equipmentType entry', () => {
    const blocks = [{ _: [{ equipmentType: 'toolArtisan' }] }]
    const result = resolveEquipmentWithBlockChoices(blocks, EMPTY_LOOKUP, [])

    expect(result.items[0].name).toBe("Artisan's Tools")
  })

  test('returns empty items for empty blocks', () => {
    const result = resolveEquipmentWithBlockChoices([], EMPTY_LOOKUP, [])
    expect(result.items).toHaveLength(0)
    expect(result.currency.gp).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// resolveClassStartingEquipmentOptions
// ---------------------------------------------------------------------------

describe('resolveClassStartingEquipmentOptions', () => {
  test('returns separate A and B packages', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const handaxe = makeItem('Handaxe', 'PHB')
    const lookup = buildItemLookup([dagger, handaxe])

    const se = { defaultData: [{ A: ['dagger|PHB'], B: ['handaxe|PHB'] }] }
    const result = resolveClassStartingEquipmentOptions(se, lookup)

    expect(result.A.items.some((i) => i.name === 'Dagger')).toBe(true)
    expect(result.A.items.some((i) => i.name === 'Handaxe')).toBe(false)
    expect(result.B.items.some((i) => i.name === 'Handaxe')).toBe(true)
    expect(result.B.items.some((i) => i.name === 'Dagger')).toBe(false)
  })

  test('both options include fixed _ items', () => {
    const shield = makeItem('Shield', 'PHB')
    const dagger = makeItem('Dagger', 'PHB')
    const handaxe = makeItem('Handaxe', 'PHB')
    const lookup = buildItemLookup([shield, dagger, handaxe])

    const se = { defaultData: [{ _: ['shield|PHB'], A: ['dagger|PHB'], B: ['handaxe|PHB'] }] }
    const result = resolveClassStartingEquipmentOptions(se, lookup)

    expect(result.A.items.some((i) => i.name === 'Shield')).toBe(true)
    expect(result.B.items.some((i) => i.name === 'Shield')).toBe(true)
  })

  test('returns empty packages for empty startingEquipment', () => {
    const result = resolveClassStartingEquipmentOptions({ defaultData: [] }, EMPTY_LOOKUP)
    expect(result.A.items).toHaveLength(0)
    expect(result.B.items).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// resolveBackgroundStartingEquipmentPackage
// ---------------------------------------------------------------------------

describe('resolveBackgroundStartingEquipmentPackage', () => {
  test('resolves items and currency from background blocks', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const lookup = buildItemLookup([dagger])

    // 150 cp = 1gp 5sp
    const se = [{ _: ['dagger|PHB', { value: 150 }] }]
    const result = resolveBackgroundStartingEquipmentPackage(se, lookup)

    expect(result.items.some((i) => i.name === 'Dagger')).toBe(true)
    expect(result.currency.gp).toBe(1)
    expect(result.currency.sp).toBe(5)
  })

  test('respects preferred option b', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const handaxe = makeItem('Handaxe', 'PHB')
    const lookup = buildItemLookup([dagger, handaxe])

    const se = [{ A: ['dagger|PHB'], B: ['handaxe|PHB'] }]
    const resultB = resolveBackgroundStartingEquipmentPackage(se, lookup, 'b')

    expect(resultB.items.some((i) => i.name === 'Handaxe')).toBe(true)
    expect(resultB.items.some((i) => i.name === 'Dagger')).toBe(false)
  })

  test('defaults to option a', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const handaxe = makeItem('Handaxe', 'PHB')
    const lookup = buildItemLookup([dagger, handaxe])

    const se = [{ A: ['dagger|PHB'], B: ['handaxe|PHB'] }]
    const result = resolveBackgroundStartingEquipmentPackage(se, lookup)

    expect(result.items.some((i) => i.name === 'Dagger')).toBe(true)
  })

  test('accepts startingEquipment as object with defaultData', () => {
    const dagger = makeItem('Dagger', 'PHB')
    const lookup = buildItemLookup([dagger])

    const se = { defaultData: [{ _: ['dagger|PHB'] }] }
    const result = resolveBackgroundStartingEquipmentPackage(se, lookup)
    expect(result.items.some((i) => i.name === 'Dagger')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// formatEquipmentOptionEntries
// ---------------------------------------------------------------------------

describe('formatEquipmentOptionEntries', () => {
  test('formats single-quantity items by name only', () => {
    const pkg = {
      items: [{ name: 'Dagger', quantity: 1, source: 'PHB', type: 'W' }],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    }
    const entries = formatEquipmentOptionEntries(pkg as never)
    expect(entries).toContain('Dagger')
    expect(entries[0]).not.toContain('×')
  })

  test('formats multi-quantity items with × prefix', () => {
    const pkg = {
      items: [{ name: 'Arrow', quantity: 20, source: 'PHB', type: 'G' }],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    }
    const entries = formatEquipmentOptionEntries(pkg as never)
    expect(entries[0]).toBe('20× Arrow')
  })

  test('includes gp currency line', () => {
    const pkg = { items: [], currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 } }
    const entries = formatEquipmentOptionEntries(pkg as never)
    expect(entries).toContain('10 gp')
  })

  test('includes all non-zero currency denominations', () => {
    const pkg = { items: [], currency: { cp: 3, sp: 2, ep: 1, gp: 5, pp: 1 } }
    const entries = formatEquipmentOptionEntries(pkg as never)
    expect(entries).toContain('1 pp')
    expect(entries).toContain('5 gp')
    expect(entries).toContain('1 ep')
    expect(entries).toContain('2 sp')
    expect(entries).toContain('3 cp')
  })

  test('returns empty array when nothing to show', () => {
    const pkg = { items: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } }
    expect(formatEquipmentOptionEntries(pkg as never)).toEqual([])
  })
})
