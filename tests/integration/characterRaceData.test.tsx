import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useCharacterRaceData } from '@/hooks/character/useCharacterRaceData'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const catalog = vi.hoisted(() => ({ filtered: [] as Race5e[], raw: [] as Race5e[] }))
vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({ races: catalog.filtered }),
}))
vi.mock('@/hooks/data/useGameData', () => ({
  useRaceLookup: () => buildRaceLookup(catalog.raw),
}))

function installRace(record: Record<string, unknown>): Race5e {
  const race = (
    parseRaces({ race: [{ name: 'Test Race', source: 'TEST', ...record }] }) as Race5e[]
  )[0]
  catalog.filtered = [race]
  catalog.raw = [race]
  return race
}

function selectedCharacter(race: Race5e, subrace: Race5e) {
  return makeCharacterFixture({
    race: race.name,
    raceSource: race.source,
    subrace: subrace.name,
    subraceSource: subrace.source,
  })
}

describe('character race spell data', () => {
  beforeEach(() => {
    catalog.filtered = []
    catalog.raw = []
  })
  afterEach(cleanup)

  test('one inherited version spell stays fixed instead of becoming a choice against itself', () => {
    const race = installRace({
      additionalSpells: [{ ability: 'int', innate: { 1: ['light'] } }],
      _versions: [{ name: 'Test Race; Complete', source: 'TEST' }],
    })
    const character = selectedCharacter(race, race.subraces![0])
    const { result } = renderHook(() => useCharacterRaceData(character))
    expect(result.current.mergedAdditionalSpells).toHaveLength(1)
    const racial = ensureSpellProfiles(character, new Map(), {
      name: result.current.displayName!,
      source: result.current.displaySource,
      additionalSpells: result.current.mergedAdditionalSpells,
    }).find((profile) => profile.type === 'racial')
    expect(racial?.fixedSpells).toEqual(['light'])
    expect(racial?.choices).toBeUndefined()
  })

  test('an inherited version spell choice retains its filter and count', () => {
    const race = installRace({
      additionalSpells: [
        { ability: 'int', known: { _: [{ choose: 'level=0|class=Sorcerer', count: 1 }] } },
      ],
      _versions: [{ name: 'Test Race; Choice', source: 'TEST' }],
    })
    const character = selectedCharacter(race, race.subraces![0])
    const { result } = renderHook(() => useCharacterRaceData(character))
    const racial = ensureSpellProfiles(character, new Map(), {
      name: result.current.displayName!,
      source: result.current.displaySource,
      additionalSpells: result.current.mergedAdditionalSpells,
    }).find((profile) => profile.type === 'racial')
    expect(racial?.choices).toEqual([
      expect.objectContaining({ count: 1, filter: { level: 0, classes: ['Sorcerer'] } }),
    ])
  })

  test('a complete version removal does not restore parent spell grants', () => {
    const race = installRace({
      additionalSpells: [{ innate: { 1: ['light'] } }],
      _versions: [{ name: 'Test Race; Removed', source: 'TEST', additionalSpells: null }],
    })
    const character = selectedCharacter(race, race.subraces![0])
    const { result } = renderHook(() => useCharacterRaceData(character))
    expect(result.current.mergedAdditionalSpells).toEqual([])
    expect(
      ensureSpellProfiles(character, new Map(), {
        name: result.current.displayName!,
        additionalSpells: result.current.mergedAdditionalSpells,
      }).some((profile) => profile.type === 'racial'),
    ).toBe(false)
  })

  test('traditional subraces retain additive parent and subrace spell grants', () => {
    const parentBlock = { innate: { 1: ['light'] } }
    const subraceBlock = { innate: { 1: ['mage hand'] } }
    const race = installRace({
      additionalSpells: [parentBlock],
      subraces: [{ name: 'Traditional', source: 'TEST', additionalSpells: [subraceBlock] }],
    })
    const character = selectedCharacter(race, race.subraces![0])
    const { result } = renderHook(() => useCharacterRaceData(character))
    expect(result.current.mergedAdditionalSpells).toEqual([parentBlock, subraceBlock])
  })

  test('traditional subrace filtering retains unnamed and matching parent blocks', () => {
    const shared = { innate: { 1: ['light'] } }
    const selected = { name: 'Selected', innate: { 1: ['mage hand'] } }
    const race = installRace({
      additionalSpells: [shared, selected, { name: 'Other', innate: { 1: ['minor illusion'] } }],
      subraces: [{ name: 'Selected', source: 'TEST' }],
    })
    const character = selectedCharacter(race, race.subraces![0])
    const { result } = renderHook(() => useCharacterRaceData(character))
    expect(result.current.mergedAdditionalSpells).toEqual([shared, selected])
  })

  test('saved versions use their complete grants when the parent is filtered out', () => {
    const race = installRace({
      additionalSpells: [{ innate: { 1: ['light'] } }],
      _versions: [{ name: 'Test Race; Removed', source: 'TEST', additionalSpells: null }],
    })
    catalog.filtered = []
    const character = selectedCharacter(race, race.subraces![0])
    const { result } = renderHook(() => useCharacterRaceData(character))
    expect(result.current.parentRace?.source).toBe('TEST')
    expect(result.current.subraceData?.name).toBe('Removed')
    expect(result.current.mergedAdditionalSpells).toEqual([])
  })
})
