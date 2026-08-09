import { describe, expect, test } from 'vitest'
import { getActiveExhaustionEffects } from '@/pages/details/ConditionsPage'

describe('getActiveExhaustionEffects', () => {
  test('returns every effect through the current exhaustion level', () => {
    expect(getActiveExhaustionEffects(3)).toEqual([
      'Disadvantage on ability checks',
      'Speed halved',
      'Disadvantage on attacks and saves',
    ])
  })

  test('returns no effects at level zero', () => {
    expect(getActiveExhaustionEffects(0)).toEqual([])
  })

  test('clamps invalid exhaustion levels', () => {
    expect(getActiveExhaustionEffects(99)).toHaveLength(6)
    expect(getActiveExhaustionEffects(-1)).toEqual([])
  })
})
