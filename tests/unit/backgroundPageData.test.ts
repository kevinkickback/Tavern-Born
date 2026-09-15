import { describe, expect, test } from 'vitest'
import type { BackgroundAbilityData } from '@/lib/calculations/abilityScores'
import { getBackgroundAbilitySummary } from '@/pages/build/background/model/data'

describe('getBackgroundAbilitySummary', () => {
  const abilityData: BackgroundAbilityData = {
    blocks: [
      {
        from: ['strength', 'dexterity', 'constitution'],
        weights: [2, 1],
      },
      {
        from: ['strength', 'dexterity', 'constitution'],
        weights: [1, 1, 1],
      },
    ],
  }

  test('describes every parsed assignment pattern and the current selection', () => {
    expect(getBackgroundAbilitySummary(abilityData, 0, ['strength', 'dexterity'])).toEqual({
      current: '+2 STR · +1 DEX',
      options:
        '+2/+1 across 2 different abilities from STR, DEX, CON or +1/+1/+1 across 3 different abilities from STR, DEX, CON',
    })
  })

  test('does not present an incomplete or duplicate assignment as configured', () => {
    expect(getBackgroundAbilitySummary(abilityData, 1, ['strength', 'strength', ''])).toMatchObject(
      {
        current: 'Not configured',
      },
    )
  })
})
