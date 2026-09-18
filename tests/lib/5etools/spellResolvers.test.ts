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
})
