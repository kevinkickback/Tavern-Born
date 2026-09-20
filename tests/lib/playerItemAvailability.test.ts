import { describe, expect, test } from 'vitest'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import type { Item5e } from '@/types/5etools'

function item(overrides: Partial<Item5e>): Item5e {
  return {
    name: 'Fixture Item',
    source: 'PHB',
    type: 'G',
    ...overrides,
  }
}

describe('character item availability', () => {
  test('includes public 2014 core potions and spell scrolls without enabling the DMG', () => {
    const potion = item({ name: 'Potion of Healing', source: 'DMG', type: 'P', srd: true })
    const scroll = item({
      name: 'Spell Scroll (1st Level)',
      source: 'DMG',
      type: 'SC',
      basicRules: true,
    })

    expect(
      filterCharacterItems([potion, scroll], {
        allowedSources: ['PHB'],
        originSystem: '2014',
      }),
    ).toEqual([potion, scroll])
  })

  test('does not expose unrelated, private, or wrong-edition DMG content', () => {
    const bag = item({ name: 'Bag of Holding', source: 'DMG', type: 'W', srd: true })
    const privatePotion = item({ name: 'DM-only Potion', source: 'DMG', type: 'P' })
    const revisedPotion = item({
      name: 'Revised Potion',
      source: 'XDMG',
      type: 'P',
      srd52: true,
    })

    expect(
      filterCharacterItems([bag, privatePotion, revisedPotion], {
        allowedSources: ['PHB'],
        originSystem: '2014',
      }),
    ).toEqual([])
  })

  test('includes public 2024 consumables and still honors explicitly enabled sources', () => {
    const revisedScroll = item({
      name: 'Spell Scroll (Level 1)',
      source: 'XDMG',
      type: 'SC',
      basicRules2024: true,
    })
    const supplementPotion = item({
      name: 'Potion of Possibility',
      source: 'EGW',
      type: 'P',
    })

    expect(
      filterCharacterItems([revisedScroll, supplementPotion], {
        allowedSources: ['XPHB', 'EGW'],
        originSystem: '2024',
      }),
    ).toEqual([revisedScroll, supplementPotion])
  })

  test('includes every matching public core item for the bundled SRD only', () => {
    const legacyBag = item({ name: 'Bag of Holding', source: 'DMG', type: 'W', srd: true })
    const revisedBag = item({
      name: 'Revised Bag of Holding',
      source: 'XDMG',
      type: 'W',
      srd52: true,
    })
    const privateItem = item({ name: 'Private Item', source: 'DMG', type: 'W' })

    expect(
      filterCharacterItems([legacyBag, revisedBag, privateItem], {
        allowedSources: ['PHB'],
        originSystem: '2014',
        includeBundledSrdItems: true,
      }),
    ).toEqual([legacyBag])
    expect(
      filterCharacterItems([legacyBag, revisedBag, privateItem], {
        allowedSources: ['XPHB'],
        originSystem: '2024',
        includeBundledSrdItems: true,
      }),
    ).toEqual([revisedBag])
  })
})
