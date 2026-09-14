import { describe, expect, test } from 'vitest'
import {
  dedupeSpellNames,
  getSpellNameKey,
  getSpellReferenceKey,
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

  test('deduplicates persisted name-only spell collections case-insensitively', () => {
    expect(dedupeSpellNames(['mage hand', 'Mage Hand', 'Shield'])).toEqual(['mage hand', 'Shield'])
  })
})
