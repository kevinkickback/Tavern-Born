import { describe, expect, test } from 'vitest'
import type { BackgroundAbilityData } from '@/lib/calculations/abilityScores'
import { getPendingBackgroundAbilityRows } from '@/lib/provenance'
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
      options: '+2/+1 from STR, DEX, CON or +1/+1/+1 from STR, DEX, CON',
    })
  })

  test('does not present an incomplete or duplicate assignment as configured', () => {
    expect(getBackgroundAbilitySummary(abilityData, 1, ['strength', 'strength', ''])).toMatchObject(
      {
        current: 'Not configured',
      },
    )
  })

  test('builds a pending source row from parsed patterns until the assignment is complete', () => {
    expect(getPendingBackgroundAbilityRows(abilityData, 0, [])).toEqual([
      {
        itemName: 'choose +2/+1 from STR, DEX, CON or +1/+1/+1 from STR, DEX, CON',
        category: 'Ability Bonuses',
        attribution: 'background',
        sourceTypes: ['background'],
        isPending: true,
      },
    ])
    expect(getPendingBackgroundAbilityRows(abilityData, 0, ['strength', 'dexterity'])).toEqual([])
  })
})
