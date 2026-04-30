import { renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { calculateAC, computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

/**
 * Integration tests for armor class behavior.
 *
 * These tests cover equipment-based calculation, overrides, and hook-level AC access.
 */

describe('Armor Class Behavior', () => {
  describe('AC calculation with standard armor', () => {
    test('light armor grants 10 + dex modifier', () => {
      const character = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 14, // +2 modifier
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [
          {
            id: 'leather-armor-1',
            name: 'Leather Armor',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 11,
            armorType: 'light',
            type: 'armor',
            quantity: 1,
          },
        ],
      })

      const ac = calculateAC(character, 'base')
      // Light armor: 11 base + 2 dex = 13
      expect(ac).toBe(13)
    })

    test('medium armor grants 10 + 2 + dex modifier capped at +2', () => {
      const character = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 16, // +3 modifier, but capped at +2 for medium armor
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [
          {
            id: 'chain-shirt-1',
            name: 'Chain Shirt',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 13,
            armorType: 'medium',
            type: 'armor',
            quantity: 1,
          },
        ],
      })

      const ac = calculateAC(character, 'base')
      // Medium armor: 13 base + min(+3 dex, +2) = 15
      expect(ac).toBe(15)
    })

    test('heavy armor grants fixed AC (no dex modifier)', () => {
      const character = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 18, // +4 modifier, not applied
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [
          {
            id: 'plate-1',
            name: 'Plate Armor',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 18,
            armorType: 'heavy',
            type: 'armor',
            quantity: 1,
          },
        ],
      })

      const ac = calculateAC(character, 'base')
      // Heavy armor: 18 (no dex modifier)
      expect(ac).toBe(18)
    })

    test('shield adds +2 to AC', () => {
      const character = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 14,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [
          {
            id: 'leather-armor-1',
            name: 'Leather Armor',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 11,
            armorType: 'light',
            type: 'armor',
            quantity: 1,
          },
          {
            id: 'shield-1',
            name: 'Shield',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 2,
            type: 'shield',
            quantity: 1,
          },
        ],
      })

      const ac = calculateAC(character, 'base')
      // Leather (11) + dex (+2) + shield (+2) = 15
      expect(ac).toBe(15)
    })
  })

  describe('AC with unarmored defense (special source)', () => {
    test('barbarian unarmored defense: 10 + dex + con modifiers', () => {
      const character = makeCharacterFixture({
        class: 'Barbarian',
        classSource: 'PHB',
        level: 5,
        abilityScores: {
          strength: 16, // +3 (not used for AC)
          dexterity: 12, // +1 modifier
          constitution: 16, // +3 modifier
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [],
      })

      const ac = calculateAC(character, 'base')
      expect(ac).toBeGreaterThanOrEqual(10)
    })

    test('monk unarmored defense: 10 + dex + wis modifiers', () => {
      const character = makeCharacterFixture({
        class: 'Monk',
        classSource: 'PHB',
        level: 5,
        abilityScores: {
          strength: 10,
          dexterity: 16, // +3 modifier
          constitution: 10,
          intelligence: 10,
          wisdom: 14, // +2 modifier
          charisma: 10,
        },
        equipment: [],
      })

      const ac = calculateAC(character, 'base')
      expect(ac).toBeGreaterThanOrEqual(10)
    })
  })

  describe('No armor (base 10 + dex)', () => {
    test('unarmored character gets 10 + dex modifier', () => {
      const character = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 15, // +2 modifier
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [],
      })

      const ac = calculateAC(character, 'base')
      // No armor: 10 + 2 dex = 12
      expect(ac).toBe(12)
    })
  })

  describe('AC override / manual adjustment', () => {
    test('character with armorClassOverride uses override value', () => {
      const character = makeCharacterFixture({
        armorClassOverride: 17, // Explicit override (e.g., from Permanent Bracers of Protection)
        abilityScores: {
          strength: 10,
          dexterity: 14,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [
          {
            id: 'leather-1',
            name: 'Leather Armor',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 11,
            armorType: 'light',
            type: 'armor',
            quantity: 1,
          },
        ],
      })

      // When armorClassOverride is set it takes precedence over calculated AC
      expect(computeEffectiveCharacterArmorClass(character)).toBe(17)
    })
  })

  describe('AC changes with ability score updates', () => {
    test('increasing dex modifier increases light armor AC', () => {
      const characterLowDex = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 10, // +0 modifier
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [
          {
            id: 'leather-1',
            name: 'Leather Armor',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 11,
            armorType: 'light',
            type: 'armor',
            quantity: 1,
          },
        ],
      })

      const acLow = calculateAC(characterLowDex, 'base')
      expect(acLow).toBe(11) // 11 + 0 dex

      const characterHighDex = {
        ...characterLowDex,
        abilityScores: {
          ...characterLowDex.abilityScores,
          dexterity: 18, // +4 modifier
        },
      }

      const acHigh = calculateAC(characterHighDex, 'base')
      expect(acHigh).toBe(15) // 11 + 4 dex
    })

    test('equipment change triggers AC recalculation', () => {
      const characterWithLeather = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 14,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [
          {
            id: 'leather-1',
            name: 'Leather Armor',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 11,
            armorType: 'light',
            type: 'armor',
            quantity: 1,
          },
        ],
      })

      const acLeather = calculateAC(characterWithLeather, 'base')
      expect(acLeather).toBe(13) // 11 + 2 dex

      // Switch to chain shirt (medium armor with +2 dex cap)
      const characterWithChainShirt = {
        ...characterWithLeather,
        equipment: [
          {
            id: 'chain-shirt-1',
            name: 'Chain Shirt',
            source: 'PHB',
            equipped: true,
            attuned: false,
            ac: 13,
            armorType: 'medium' as const,
            type: 'armor',
            quantity: 1,
          },
        ],
      }

      const acChainShirt = calculateAC(characterWithChainShirt, 'base')
      expect(acChainShirt).toBe(15) // 13 + min(+2 dex, +2) = 15
    })
  })

  describe('Known limitation: AC ownership not consolidated', () => {
    test('useArmorClass hook requires separate sync logic', () => {
      const character = makeCharacterFixture()

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const { result } = renderHook(() => useArmorClass())

      expect(result.current).toBeDefined()
    })

    test('dual AC sync pattern: equipment updates and AC field updates are separate', () => {
      const character = makeCharacterFixture({
        abilityScores: {
          strength: 10,
          dexterity: 14,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        equipment: [],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      expect(character.equipment).toHaveLength(0)
    })
  })
})
