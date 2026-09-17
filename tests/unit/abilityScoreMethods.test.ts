import { describe, expect, test } from 'vitest'
import { getAbilityScoreMethodOptions } from '@/lib/calculations/abilityScoreMethods'

describe('ability score method options', () => {
  test.each([
    '2014',
    '2024',
  ] as const)('derives %s descriptions from the selected core-rules metadata', (originSystem) => {
    const options = getAbilityScoreMethodOptions(originSystem)
    expect(options.map((option) => option.value)).toEqual(['point-buy', 'standard-array', 'custom'])
    expect(options[0].description).toContain('27 points')
    expect(options[0].description).toContain('from 8 to 15')
    expect(options[1].description).toContain('15, 14, 13, 12, 10, and 8')
  })
})
