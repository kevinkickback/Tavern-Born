import { describe, expect, test } from 'vitest'
import { formatCopperValue } from '@/lib/calculations/currency'

describe('formatCopperValue', () => {
  test.each([
    [1, '1 cp'],
    [10, '1 sp'],
    [100, '1 gp'],
    [125, '1 gp 25 cp'],
    [200, '2 gp'],
  ])('formats %i copper as %s', (value, expected) => {
    expect(formatCopperValue(value)).toBe(expected)
  })
})
