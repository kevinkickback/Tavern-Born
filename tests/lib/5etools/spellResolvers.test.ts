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

  test('keeps the source-less fallback deterministic', () => {
    const xphb = { name: 'Alarm', source: 'XPHB' } as Spell5e
    const phb = { name: 'Alarm', source: 'PHB' } as Spell5e

    expect(resolveSpellReference('alarm', { z: xphb, a: phb })).toBe(phb)
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

  test('tagged source-less references retain the deterministic legacy fallback', () => {
    const phb = { name: 'Alarm', source: 'PHB' } as Spell5e
    const xphb = { name: 'Alarm', source: 'XPHB' } as Spell5e
    expect(resolveSpellReference('{@spell Alarm}', { z: xphb, a: phb })).toBe(phb)
  })
})
