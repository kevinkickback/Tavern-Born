import { describe, expect, test } from 'vitest'
import { buildRecursiveLookup, getRecursiveHintPosition } from '@/lib/renderer/recursiveTooltip'
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

  test('staggers a child preview when neither side has room', () => {
    const container = document.createElement('div')
    const target = document.createElement('span')
    container.dataset.recursiveTooltipDepth = '0'
    container.append(target)
    document.body.append(container)

    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 })
      container.getBoundingClientRect = () =>
        ({ left: 160, right: 480, top: 100, bottom: 340, width: 320, height: 240 }) as DOMRect
      target.getBoundingClientRect = () =>
        ({ left: 220, right: 280, top: 120, bottom: 140, width: 60, height: 20 }) as DOMRect

      expect(getRecursiveHintPosition(target, true)).toEqual({ x: 24, y: 24 })
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
      container.remove()
    }
  })
})
