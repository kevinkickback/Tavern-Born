import { describe, expect, test } from 'vitest'
import { applyClassAsiChoice, resetClassAsiChoice } from '@/pages/build/class/model/asi'

describe('buildClassAsiUtils', () => {
  test('applyClassAsiChoice applies a new ASI and appends choice', () => {
    const result = applyClassAsiChoice({
      currentAsiChoices: [],
      className: 'Fighter',
      level: 4,
      abilityChanges: { strength: 2 },
    })

    expect(result).toEqual([
      {
        id: 'asi-Fighter-4',
        className: 'Fighter',
        level: 4,
        abilityChanges: { strength: 2 },
      },
    ])
  })

  test('applyClassAsiChoice replaces existing ASI at same class/level', () => {
    const result = applyClassAsiChoice({
      currentAsiChoices: [
        {
          id: 'asi-Fighter-4',
          className: 'Fighter',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
      className: 'Fighter',
      level: 4,
      abilityChanges: { constitution: 2 },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.abilityChanges).toEqual({ constitution: 2 })
  })

  test('resetClassAsiChoice removes the matching ASI choice', () => {
    const result = resetClassAsiChoice({
      currentAsiChoices: [
        {
          id: 'asi-Fighter-4',
          className: 'Fighter',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
      className: 'Fighter',
      level: 4,
    })

    expect(result).not.toBeNull()
    expect(result).toEqual([])
  })
})
