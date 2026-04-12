import { describe, expect, test } from 'vitest'
import { getBackgroundEquipmentPackages } from '@/pages/build/background/model/data'
import type { Background5e } from '@/types/5etools'

describe('buildBackgroundData', () => {
  test('getBackgroundEquipmentPackages supports 2024 uppercase option keys', () => {
    const background = {
      name: 'Acolyte',
      source: 'XPHB',
      startingEquipment: [
        {
          A: ['book|xphb'],
          B: [{ value: 5000 }],
        },
      ],
    } as Background5e

    expect(getBackgroundEquipmentPackages(background)).toEqual([
      { key: 'a', label: 'Option A', entries: ['book|xphb'] },
      { key: 'b', label: 'Option B', entries: [{ value: 5000 }] },
    ])
  })

  test('getBackgroundEquipmentPackages supports 2014 lowercase option keys', () => {
    const background = {
      name: 'Acolyte',
      source: 'PHB',
      startingEquipment: [
        {
          _: ['holy symbol|phb'],
        },
        {
          a: ['book|phb'],
          b: [{ special: 'prayer wheel' }],
        },
      ],
    } as Background5e

    expect(getBackgroundEquipmentPackages(background)).toEqual([
      { key: 'a', label: 'Option A', entries: ['book|phb'] },
      { key: 'b', label: 'Option B', entries: [{ special: 'prayer wheel' }] },
    ])
  })
})
