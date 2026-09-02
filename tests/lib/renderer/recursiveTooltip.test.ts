import { describe, expect, test } from 'vitest'
import { buildRecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import type { Item5e, Spell5e } from '@/types/5etools'

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
})
