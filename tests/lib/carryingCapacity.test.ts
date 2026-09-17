import { describe, expect, test } from 'vitest'
import { getEffectiveCarryCapacity } from '@/lib/calculations/carryingCapacity'

describe('effective carrying capacity', () => {
  test('applies typed modifiers to the rules-derived base value', () => {
    expect(
      getEffectiveCarryCapacity(12, [
        {
          id: 'test-capacity-multiplier',
          label: 'Test capacity multiplier',
          target: { kind: 'carrying-capacity' },
          operation: { kind: 'multiply', value: 2 },
          source: { kind: 'manual', name: 'Test capacity multiplier' },
        },
      ]),
    ).toBe(360)
  })

  test('honors active requirements and clamps invalid negative results', () => {
    const effect = {
      id: 'test-capacity-override',
      label: 'Test capacity override',
      target: { kind: 'carrying-capacity' as const },
      operation: { kind: 'override' as const, value: -5 },
      source: { kind: 'manual' as const, name: 'Test capacity override' },
      requirements: [{ kind: 'flag' as const, key: 'enabled', expected: true }],
    }

    expect(getEffectiveCarryCapacity(10, [effect], { flags: { enabled: false } })).toBe(150)
    expect(getEffectiveCarryCapacity(10, [effect], { flags: { enabled: true } })).toBe(0)
  })
})
