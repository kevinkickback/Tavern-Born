import { describe, expect, test } from 'vitest'
import {
  dedupeSpellNames,
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
  parseSpellReference,
  resolveSpellReferenceFromMap,
  resolveSpellSelectionMetadata,
} from '@/lib/calculations/spellIdentity'

describe('spell identity', () => {
  test('normalizes display, tagged, and source-qualified references to the same name', () => {
    expect(getSpellNameKey('Mage Hand')).toBe('mage hand')
    expect(getSpellNameKey('mage hand|XPHB')).toBe('mage hand')
    expect(getSpellNameKey('{@spell Mage Hand|PHB}')).toBe('mage hand')
  })

  test('retains source only in source-qualified catalog keys', () => {
    expect(getSpellReferenceKey('Mage Hand', 'PHB')).toBe('mage hand|phb')
    expect(getSpellReferenceKey('mage hand|XPHB')).toBe('mage hand|xphb')
  })

  test('resolves source-qualified profile references without appending an empty source', () => {
    const xphb = { name: 'Fire Bolt', source: 'XPHB' }
    const spells = new Map([
      ['fire bolt|phb', { name: 'Fire Bolt', source: 'PHB' }],
      ['fire bolt|xphb', xphb],
    ])

    expect(resolveSpellReferenceFromMap('Fire Bolt|XPHB', spells)).toBe(xphb)
  })

  test('resolves source-qualified selection metadata from the exact catalog entry', () => {
    const spells = new Map([
      ['mage hand|phb', { level: 0, school: 'A' }],
      ['mage hand|xphb', { level: 0, school: 'P' }],
    ])

    expect(resolveSpellSelectionMetadata(['Mage Hand|PHB'], spells)).toEqual([
      { name: 'Mage Hand|PHB', spellLevel: 0, school: 'A' },
    ])
  })

  test('formats source-qualified persistence references without changing display casing', () => {
    expect(formatSpellReference('Mage Hand', 'XPHB')).toBe('Mage Hand|XPHB')
    expect(formatSpellReference('{@spell Mage Hand|PHB}')).toBe('Mage Hand|PHB')
    expect(parseSpellReference('Mage Hand|XPHB')).toEqual({ name: 'Mage Hand', source: 'XPHB' })
  })

  test('deduplicates persisted spell references by normalized name', () => {
    expect(dedupeSpellNames(['mage hand|PHB', 'Mage Hand|XPHB', 'Shield|PHB'])).toEqual([
      'mage hand|PHB',
      'Shield|PHB',
    ])
  })
})
