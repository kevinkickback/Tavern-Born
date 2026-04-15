import { renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

/**
 * Integration tests for allowedSources filtering.
 *
 * These tests verify character-scoped filtering for spells, feats, items, races,
 * classes, and backgrounds.
 */

describe('Content Filtering (allowedSources)', () => {
  describe('Character with restricted allowedSources', () => {
    test('useFilteredGameData filters spells by allowedSources', () => {
      // Character with only PHB sources
      const character = makeCharacterFixture({
        allowedSources: ['PHB'],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      // Mock gameData with spells from multiple sources
      const gameData = {
        spells: [
          {
            name: 'Magic Missile',
            source: 'PHB',
            level: 1,
            school: 'evocation',
          },
          {
            name: 'Meteor Swarm',
            source: 'PHB',
            level: 9,
            school: 'evocation',
          },
          {
            name: 'Wraith Scythe', // Xanathar's Guide
            source: 'XGE',
            level: 3,
            school: 'evocation',
          },
          {
            name: 'Infernal Fury', // Tasha's Cauldron
            source: 'TCE',
            level: 4,
            school: 'abjuration',
          },
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result } = renderHook(() => useFilteredGameData())

      // Should only return PHB spells
      expect(result.current.spells.length).toBe(2)
      expect(result.current.spells.map((s) => s.name)).toEqual(['Magic Missile', 'Meteor Swarm'])
    })

    test('useFilteredGameData filters races by allowedSources', () => {
      const character = makeCharacterFixture({
        allowedSources: ['PHB', 'XGE'],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const gameData = {
        races: [
          { name: 'Human', source: 'PHB', ability: { str: 1 } },
          { name: 'Elf', source: 'PHB', ability: { dex: 2 } },
          { name: 'Mark of Detection Half-Elf', source: 'XGE', ability: { dex: 1 } },
          { name: 'Grung', source: 'VGM', ability: { dex: 2 } }, // Not in allowed sources
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.races.length).toBe(3)
      expect(result.current.races.map((r) => r.name)).toEqual([
        'Human',
        'Elf',
        'Mark of Detection Half-Elf',
      ])
      expect(result.current.races.map((r) => r.source)).not.toContain('VGM')
    })

    test('useFilteredGameData filters feats by allowedSources', () => {
      const character = makeCharacterFixture({
        allowedSources: ['PHB'],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const gameData = {
        feats: [
          { name: 'Alert', source: 'PHB' },
          { name: 'Keen Mind', source: 'PHB' },
          { name: 'Tunnel Fighter', source: 'XGE' }, // Not in allowed
          { name: 'Eldritch Sight', source: 'TCE' }, // Not in allowed
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.feats.length).toBe(2)
      expect(result.current.feats.map((f) => f.name)).toEqual(['Alert', 'Keen Mind'])
    })

    test('useFilteredGameData filters items by allowedSources', () => {
      const character = makeCharacterFixture({
        allowedSources: ['PHB', 'DMG'],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const gameData = {
        items: [
          { name: 'Longsword', source: 'PHB', type: 'martial melee weapon' },
          { name: 'Necklace of Fireballs', source: 'DMG', type: 'wondrous item' },
          { name: 'Robe of Stars', source: 'DMG', type: 'wondrous item' },
          { name: 'Immovable Rod', source: 'XGE', type: 'wondrous item' }, // Not in allowed
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.items.length).toBe(3)
      expect(result.current.items.map((i) => i.name)).not.toContain('Immovable Rod')
    })
  })

  describe('Character with expanded allowedSources', () => {
    test('useFilteredGameData returns all sources when allowedSources includes all', () => {
      const character = makeCharacterFixture({
        allowedSources: ['PHB', 'XGE', 'TCE', 'VGM', 'DMG'],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const gameData = {
        spells: [
          { name: 'Magic Missile', source: 'PHB' },
          { name: 'Wraith Scythe', source: 'XGE' },
          { name: 'Infernal Fury', source: 'TCE' },
          { name: 'Cone of Cold', source: 'PHB' },
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.spells.length).toBe(4)
    })
  })

  describe('Updating allowedSources on existing character', () => {
    test('useFilteredGameData recomputes when allowedSources changes', () => {
      const character = makeCharacterFixture({
        allowedSources: ['PHB'],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const gameData = {
        feats: [
          { name: 'Alert', source: 'PHB' },
          { name: 'Tunnel Fighter', source: 'XGE' },
          { name: 'Mobile', source: 'PHB' },
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result, rerender } = renderHook(() => useFilteredGameData())

      // Initially only PHB
      expect(result.current.feats.length).toBe(2)
      expect(result.current.feats.map((f) => f.name)).not.toContain('Tunnel Fighter')

      // Add XGE to allowed sources
      const updatedCharacter = { ...character, allowedSources: ['PHB', 'XGE'] }
      useCharacterStore.setState({
        activeCharacter: updatedCharacter,
        characters: [updatedCharacter],
      })

      rerender()

      // Now should include XGE content
      expect(result.current.feats.length).toBe(3)
      expect(result.current.feats.map((f) => f.name)).toContain('Tunnel Fighter')
    })

    test('removing a source from allowedSources filters out that content', () => {
      const character = makeCharacterFixture({
        allowedSources: ['PHB', 'XGE'],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const gameData = {
        races: [
          { name: 'Human', source: 'PHB' },
          { name: 'Elf', source: 'PHB' },
          { name: 'Mark of Detection Half-Elf', source: 'XGE' },
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result, rerender } = renderHook(() => useFilteredGameData())

      expect(result.current.races.length).toBe(3)

      // Remove XGE
      const restrictedCharacter = { ...character, allowedSources: ['PHB'] }
      useCharacterStore.setState({
        activeCharacter: restrictedCharacter,
        characters: [restrictedCharacter],
      })

      rerender()

      expect(result.current.races.length).toBe(2)
      expect(result.current.races.map((r) => r.name)).not.toContain('Mark of Detection Half-Elf')
    })
  })

  describe('Edge cases', () => {
    test('empty allowedSources returns unfiltered content (fallback)', () => {
      const character = makeCharacterFixture({
        allowedSources: [],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        characters: [character],
      })

      const gameData = {
        spells: [
          { name: 'Magic Missile', source: 'PHB' },
          { name: 'Wraith Scythe', source: 'XGE' },
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result } = renderHook(() => useFilteredGameData())

      // Should return all unfiltered content when allowedSources is empty
      expect(result.current.spells.length).toBe(2)
    })

    test('undefined allowedSources returns unfiltered content', () => {
      const character = makeCharacterFixture()
      // Explicitly don't set allowedSources
      const { allowedSources, ...charWithoutSources } = character
      const characterWithoutAllowedSources = charWithoutSources

      useCharacterStore.setState({
        activeCharacter: characterWithoutAllowedSources,
        characters: [characterWithoutAllowedSources],
      })

      const gameData = {
        spells: [
          { name: 'Magic Missile', source: 'PHB' },
          { name: 'Meteor Swarm', source: 'PHB' },
          { name: 'Wraith Scythe', source: 'XGE' },
        ],
      }

      useGameDataStore.setState({
        gameData,
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.spells.length).toBe(3)
    })
  })

  /**
   * CompendiumPage intentionally uses global game data, so that behavior is not
   * covered by these character-scoped filtering tests.
   */
})
