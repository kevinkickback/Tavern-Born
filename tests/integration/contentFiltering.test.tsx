import { renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function partialGameData(partial: unknown): GameData {
  return partial as GameData
}

/**
 * Integration tests for allowedSources filtering.
 *
 * These tests verify character-scoped filtering for spells, feats, items, races,
 * classes, and backgrounds.
 */

describe('Content Filtering (allowedSources)', () => {
  describe('Character with restricted allowedSources', () => {
    test('retains the edition monster catalog needed by creature choices', () => {
      const character = makeCharacterFixture({
        originSystem: '2014',
        allowedSources: ['PHB', 'TCE'],
      })
      useCharacterStore.setState({ activeCharacter: character, characters: [character] })
      useGameDataStore.setState({
        gameData: partialGameData({
          creatures: [
            { name: 'Wolf', source: 'MM', type: 'beast', size: ['M'], cr: '1/4' },
            { name: 'Beast of the Land', source: 'TCE', type: 'beast', size: ['M'], cr: 'PB' },
            { name: 'Revised Wolf', source: 'XMM', type: 'beast', size: ['M'], cr: '1/4' },
          ],
          sources: [],
        }),
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.creatures.map((creature) => creature.name)).toEqual([
        'Wolf',
        'Beast of the Land',
      ])
    })

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
        gameData: partialGameData(gameData),
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
        gameData: partialGameData(gameData),
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
        gameData: partialGameData(gameData),
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
        gameData: partialGameData(gameData),
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.items.length).toBe(3)
      expect(result.current.items.map((i) => i.name)).not.toContain('Immovable Rod')
    })

    test('useFilteredGameData retains Included SRD items when additional content is configured', () => {
      const character = makeCharacterFixture({ allowedSources: ['PHB'] })
      useCharacterStore.setState({ activeCharacter: character, characters: [character] })
      useGameDataStore.setState({
        dataSourceConfig: {
          type: 'local',
          path: 'additional-content',
          isValid: true,
        },
        gameData: partialGameData({
          items: [
            { name: 'Bag of Holding', source: 'DMG', type: 'W', srd: true },
            { name: 'Private Item', source: 'DMG', type: 'W' },
            { name: 'Revised Bag', source: 'XDMG', type: 'W', srd52: true },
          ],
        }),
      })

      const { result, unmount } = renderHook(() => useFilteredGameData())

      expect(result.current.items.map((item) => item.name)).toEqual(['Bag of Holding'])
      unmount()
      useGameDataStore.setState({ dataSourceConfig: null })
    })

    test('preferNewerPrintings suppresses nested class reprints', () => {
      const character = makeCharacterFixture({
        allowedSources: ['PHB', 'TCE'],
        variantRules: { preferNewerPrintings: true },
      })
      useCharacterStore.setState({ activeCharacter: character, characters: [character] })

      useGameDataStore.setState({
        gameData: partialGameData({
          classes: [
            {
              name: 'Wizard',
              source: 'PHB',
              classFeatures: [
                {
                  name: 'Legacy Training',
                  source: 'PHB',
                  reprintedAs: ['Legacy Training|TCE'],
                },
                { name: 'Legacy Training', source: 'TCE' },
              ],
              subclasses: [
                {
                  name: 'Legacy School',
                  shortName: 'Legacy',
                  source: 'PHB',
                  className: 'Wizard',
                  reprintedAs: ['Current School|Wizard|TCE|TCE'],
                },
                {
                  name: 'Current School',
                  shortName: 'Current',
                  source: 'TCE',
                  className: 'Wizard',
                },
              ],
            },
          ],
        }),
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.classes[0]?.classFeatures).toEqual([
        { name: 'Legacy Training', source: 'TCE' },
      ])
      expect(result.current.classes[0]?.subclasses?.map((subclass) => subclass.shortName)).toEqual([
        'Current',
      ])
    })

    test('preferNewerPrintings suppresses reprinted creatures', () => {
      const character = makeCharacterFixture({
        allowedSources: ['VGM', 'TCE'],
        variantRules: { preferNewerPrintings: true },
      })
      useCharacterStore.setState({ activeCharacter: character, characters: [character] })
      useGameDataStore.setState({
        gameData: partialGameData({
          creatures: [
            {
              name: 'Beastling',
              source: 'VGM',
              reprintedAs: ['Beastling|TCE'],
              type: 'beast',
            },
            { name: 'Beastling', source: 'TCE', type: 'beast' },
          ],
          sources: [],
        }),
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(
        result.current.creatures.map((creature) => `${creature.name}|${creature.source}`),
      ).toEqual(['Beastling|TCE'])
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
        gameData: partialGameData(gameData),
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.spells.length).toBe(4)
    })
  })

  describe('Ruleset compatibility', () => {
    test('2014 characters ignore revised-only sources and revised core counterparts', () => {
      const character = makeCharacterFixture({
        originSystem: '2014',
        allowedSources: ['DMG', 'XDMG', 'EFA'],
      })
      useCharacterStore.setState({ activeCharacter: character, characters: [character] })
      useGameDataStore.setState({
        gameData: partialGameData({
          sources: [
            { abbreviation: 'PHB', name: 'PHB', group: 'core' },
            { abbreviation: 'DMG', name: 'DMG', group: 'core' },
            { abbreviation: 'XDMG', name: 'XDMG', group: 'core', minimumRuleset: '2024' },
            { abbreviation: 'EFA', name: 'EFA', group: 'setting', minimumRuleset: '2024' },
          ],
          backgrounds: [
            { name: 'Sage', source: 'PHB' },
            { name: 'Revised Inventor', source: 'EFA', edition: 'one' },
          ],
          items: [
            { name: 'Legacy Relic', source: 'DMG', type: 'wondrous item' },
            { name: 'Revised Relic', source: 'XDMG', type: 'wondrous item' },
          ],
        }),
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.backgrounds.map((background) => background.name)).toEqual(['Sage'])
      expect(result.current.items.map((item) => item.name)).toEqual(['Legacy Relic'])
    })

    test('2024 characters use revised replacements and retain explicit legacy exceptions', () => {
      const character = makeCharacterFixture({
        originSystem: '2024',
        allowedSources: ['TCE', 'DMG', 'XDMG'],
        variantRules: { preferNewerPrintings: false },
      })
      useCharacterStore.setState({ activeCharacter: character, characters: [character] })
      useGameDataStore.setState({
        gameData: partialGameData({
          sources: [
            { abbreviation: 'XPHB', name: 'XPHB', group: 'core', minimumRuleset: '2024' },
            { abbreviation: 'DMG', name: 'DMG', group: 'core' },
            { abbreviation: 'XDMG', name: 'XDMG', group: 'core', minimumRuleset: '2024' },
            { abbreviation: 'TCE', name: 'TCE', group: 'supplement' },
          ],
          races: [
            { name: 'Half-Orc', source: 'PHB' },
            { name: 'Human', source: 'PHB', reprintedAs: ['Human|XPHB'] },
            { name: 'Human', source: 'XPHB', edition: 'one' },
          ],
          feats: [
            { name: 'Martial Adept', source: 'PHB' },
            { name: 'Alert', source: 'TCE', reprintedAs: ['Alert|XPHB'] },
            { name: 'Alert', source: 'XPHB' },
          ],
          classes: [
            {
              name: 'Cleric',
              source: 'XPHB',
              subclasses: [
                {
                  name: 'Knowledge Domain',
                  shortName: 'Knowledge',
                  source: 'PHB',
                  className: 'Cleric',
                  classSource: 'XPHB',
                  subclassFeatures: [
                    {
                      name: 'Blessings of Knowledge',
                      source: 'PHB',
                    },
                  ],
                },
                {
                  name: 'Life Domain',
                  shortName: 'Life',
                  source: 'PHB',
                  className: 'Cleric',
                  classSource: 'XPHB',
                },
              ],
            },
          ],
          items: [
            { name: 'Legacy Relic', source: 'DMG', type: 'wondrous item' },
            { name: 'Revised Relic', source: 'XDMG', type: 'wondrous item' },
          ],
        }),
      })

      const { result } = renderHook(() => useFilteredGameData())

      expect(result.current.races.map((race) => `${race.name}|${race.source}`)).toEqual([
        'Half-Orc|PHB',
        'Human|XPHB',
      ])
      expect(result.current.feats.map((feat) => `${feat.name}|${feat.source}`)).toEqual([
        'Martial Adept|PHB',
        'Alert|XPHB',
      ])
      expect(result.current.classes[0]?.subclasses?.map((subclass) => subclass.name)).toEqual([
        'Knowledge Domain',
      ])
      expect(result.current.classes[0]?.subclasses?.[0].subclassFeatures).toEqual([
        { name: 'Blessings of Knowledge', source: 'PHB' },
      ])
      expect(result.current.items.map((item) => item.name)).toEqual(['Revised Relic'])
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
        gameData: partialGameData(gameData),
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
        gameData: partialGameData(gameData),
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
    test('empty allowedSources filters to implicit source only', () => {
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
        gameData: partialGameData(gameData),
      })

      const { result } = renderHook(() => useFilteredGameData())

      // Empty allowedSources is treated as [implicit source] (PHB for 2014 characters),
      // not as "show everything" — so only the PHB spell is returned.
      expect(result.current.spells.length).toBe(1)
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
        gameData: partialGameData(gameData),
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
