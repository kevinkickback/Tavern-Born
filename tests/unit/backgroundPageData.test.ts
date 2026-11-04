import { describe, expect, test } from 'vitest'
import type { BackgroundAbilityData } from '@/lib/calculations/abilityScores'
import { getPendingBackgroundAbilityRows } from '@/lib/provenance'
import { getBackgroundAbilitySummary } from '@/pages/build/background/model/data'

describe('getBackgroundAbilitySummary', () => {
  const options =
    'Choose 2 abilities from STR, DEX, CON (+2 and +1, one bonus per ability) or Choose 3 abilities from STR, DEX, CON (+1 each)'
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
      current: 'STR +2 · DEX +1',
      options,
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
        itemName: options,
        category: 'Ability Bonuses',
        attribution: 'background',
        sourceTypes: ['background'],
        isPending: true,
      },
    ])
    expect(getPendingBackgroundAbilityRows(abilityData, 0, ['strength', ''])).toMatchObject([
      { itemName: 'Choose 1 more ability from DEX, CON (+1)', isPending: true },
    ])
    expect(getPendingBackgroundAbilityRows(abilityData, 0, ['strength', 'dexterity'])).toEqual([])
  })
})
