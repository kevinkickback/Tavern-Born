import { describe, expect, test } from 'vitest'
import { getItemCategories } from '@/components/modals/ItemSelectionModal'
import type { Item5e } from '@/types/5etools'

describe('item selection categories', () => {
  test('keeps parsed spellcasting foci available through the data-derived fallback category', () => {
    const crystal = {
      name: 'Crystal',
      source: 'XPHB',
      type: 'SCF|XPHB',
      rarity: 'none',
    } as Item5e

    expect(getItemCategories(crystal, { SCF: 'Spellcasting Focus' })).toEqual(new Set(['other']))
  })

  test('assigns every non-container item a category even when its type is unknown', () => {
    const homebrewItem = { name: 'Uncatalogued Device', source: 'HB', type: 'NEW' } as Item5e
    expect(getItemCategories(homebrewItem, {})).toEqual(new Set(['other']))
  })
})
