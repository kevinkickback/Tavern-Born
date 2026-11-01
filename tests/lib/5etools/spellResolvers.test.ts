import { describe, expect, test } from 'vitest'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import type { Spell5e } from '@/types/5etools'

describe('resolveSpellReference', () => {
  test('falls back case-insensitively while retaining source identity', () => {
    const phb = { name: 'Alarm', source: 'PHB' } as Spell5e
    const xphb = { name: 'Alarm', source: 'XPHB' } as Spell5e
    const spellsByKey = { 'Alarm|PHB': phb, 'Alarm|XPHB': xphb }

    expect(resolveSpellReference(' alarm | phb ', spellsByKey)).toBe(phb)
    expect(resolveSpellReference('ALARM|xphb', spellsByKey)).toBe(xphb)
  })

  test('never enriches a manual name with an arbitrary printing', () => {
    const xphb = { name: 'Alarm', source: 'XPHB' } as Spell5e
    const phb = { name: 'Alarm', source: 'PHB' } as Spell5e

    expect(resolveSpellReference('alarm', { z: xphb, a: phb })).toBeUndefined()
    expect(resolveSpellReference('Alarm', { Alarm: phb })).toBeUndefined()
  })

  test.each([
    '{@spell Alarm|XPHB}',
    ' {@spell alarm| xphb |Displayed text} ',
  ])('resolves tagged references with exact source identity: %s', (reference) => {
    const phb = { name: 'Alarm', source: 'PHB', level: 0 } as Spell5e
    const xphb = { name: 'Alarm', source: 'XPHB', level: 1 } as Spell5e
    expect(resolveSpellReference(reference, { phb, xphb })).toBe(xphb)
    expect(resolveSpellReference(reference, { phb })).toBeUndefined()
  })

  test('rejects incomplete and malformed references before direct lookup', () => {
    const phb = { name: 'Alarm', source: 'PHB' } as Spell5e
    const xphb = { name: 'Alarm', source: 'XPHB' } as Spell5e
    for (const reference of ['{@spell Alarm}', 'Alarm|', 'Alarm|PHB|junk', 'Alarm|PHB#c'])
      expect(resolveSpellReference(reference, { [reference]: phb, z: xphb })).toBeUndefined()
    expect(resolveSpellReference('Alarm|PHB', { 'Alarm|PHB': xphb })).toBeUndefined()
    expect(resolveSpellReference('Alarm|PHB', { 'Alarm|PHB': xphb, correct: phb })).toBe(phb)
  })
})
