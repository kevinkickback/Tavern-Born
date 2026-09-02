import { describe, expect, test, vi } from 'vitest'
import {
  DAMAGE_TYPE_LABELS,
  RARITY_COLORS,
  RARITY_ORDER,
  validateDamageTypeCoverage,
  validateRarityCoverage,
} from '@/lib/5etools/constants'

describe('5etools constants', () => {
  test('mirrors upstream item damage type codes', () => {
    expect(DAMAGE_TYPE_LABELS.I).toBe('Poison')
    expect(DAMAGE_TYPE_LABELS.Y).toBe('Psychic')
    expect(DAMAGE_TYPE_LABELS).not.toHaveProperty('Po')
    expect(DAMAGE_TYPE_LABELS).not.toHaveProperty('Ps')
  })

  test('covers upstream variable and unspecified magic rarities', () => {
    expect(RARITY_ORDER).toContain('varies')
    expect(RARITY_ORDER).toContain('unknown (magic)')
    expect(RARITY_COLORS).toHaveProperty('varies')
    expect(RARITY_COLORS).toHaveProperty('unknown (magic)')
  })

  test('does not warn for upstream damage and rarity values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    validateDamageTypeCoverage([{ dmgType: 'I' }, { dmgType: 'Y' }])
    validateRarityCoverage([{ rarity: 'varies' }, { rarity: 'unknown (magic)' }])

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
