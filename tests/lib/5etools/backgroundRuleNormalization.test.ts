import { describe, expect, test } from 'vitest'
import { normalizeBackgroundOriginRules } from '@/lib/5etools/backgroundRuleNormalization'

describe('background origin rule normalization', () => {
  test('preserves parsed rules and records source-qualified identity', () => {
    const ability = [{ strength: 2 }]
    const feats = [{ skilled: true }]
    expect(
      normalizeBackgroundOriginRules({ name: 'Soldier', source: 'XPHB', ability, feats }),
    ).toEqual({
      ability,
      feats,
      sourceKey: 'Soldier|XPHB',
    })
  })

  test('marks the versioned ingestion fallback when structured data is absent', () => {
    const normalized = normalizeBackgroundOriginRules({ name: 'Custom', source: 'PHB' })
    expect(normalized.sourceKey).toBe('Custom|PHB')
    expect(normalized.fallbackSource).toBeTruthy()
    expect(normalized.ability).toHaveLength(2)
    expect(normalized.feats).toHaveLength(1)
  })
})
