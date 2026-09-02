import { describe, expect, test } from 'vitest'
import { resolveFeatChoicePool } from '@/lib/calculations/featChoices'
import type { Feat5e } from '@/types/5etools'

const feats = [
  { name: 'Alert', source: 'PHB', category: 'G' },
  { name: 'Magic Initiate', source: 'PHB', category: 'O' },
  { name: 'Magic Initiate', source: 'XPHB', category: 'O' },
] as Feat5e[]

describe('resolveFeatChoicePool', () => {
  test('returns all feats for an empty option pool', () => {
    expect(resolveFeatChoicePool(feats, []).eligibleFeats).toBe(feats)
  })

  test('filters category pools and returns the matching initial modal filter', () => {
    const result = resolveFeatChoicePool(feats, ['category:O'])

    expect(result.eligibleFeats.map((feat) => `${feat.name}|${feat.source}`)).toEqual([
      'Magic Initiate|PHB',
      'Magic Initiate|XPHB',
    ])
    expect(result.initialFilters?.featCategory).toEqual(new Set(['O']))
  })

  test('filters explicit names without collapsing source collisions', () => {
    const result = resolveFeatChoicePool(feats, ['magic initiate'])

    expect(result.eligibleFeats.map((feat) => feat.source)).toEqual(['PHB', 'XPHB'])
    expect(result.initialFilters).toBeUndefined()
  })
})
