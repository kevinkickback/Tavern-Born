import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

describe('shared character calculation data', () => {
  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
    useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null, characters: [] })
  })

  test('reuses filtered data and calculations across hooks and invalidates changed inputs', async () => {
    const gameData: GameData = makeGameDataFixture({
      races: [
        { name: 'Test Race', source: 'ONE' },
        { name: 'Other Race', source: 'TWO' },
      ],
      sources: [
        { abbreviation: 'ONE', name: 'One', group: 'Test' },
        { abbreviation: 'TWO', name: 'Two', group: 'Test' },
      ],
    })
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
    let character = makeCharacterFixture({
      race: 'Test Race',
      raceSource: 'ONE',
      allowedSources: ['ONE'],
    })
    useCharacterStore.setState({
      activeCharacter: character,
      activeCharacterId: character.id,
      characters: [character],
    })

    const { result, rerender } = renderHook(() => ({
      firstData: useFilteredGameData(),
      secondData: useFilteredGameData(),
      firstCalculation: useCharacterCalculationContext(character),
      secondCalculation: useCharacterCalculationContext(character),
    }))
    expect(result.current.firstData).toBe(result.current.secondData)
    expect(result.current.firstCalculation).toBe(result.current.secondCalculation)
    expect(result.current.firstData.races.map((race) => race.source)).toEqual(['ONE'])
    const initialData = result.current.firstData
    const initialCalculation = result.current.firstCalculation

    character = { ...character, allowedSources: ['TWO'] }
    await act(() => {
      useCharacterStore.setState({ activeCharacter: character, characters: [character] })
    })
    rerender()
    expect(result.current.firstData).not.toBe(initialData)
    expect(result.current.firstData).toBe(result.current.secondData)
    expect(result.current.firstData.races.map((race) => race.source)).toEqual(['TWO'])
    expect(result.current.firstCalculation).not.toBe(initialCalculation)
    expect(result.current.firstCalculation).toBe(result.current.secondCalculation)

    const previousCalculation = result.current.firstCalculation
    const replacementData: GameData = {
      ...gameData,
      races: [{ name: 'Test Race', source: 'ONE', darkvision: 60 }],
    }
    replacementData.lookups = buildGameDataLookups(replacementData)
    await act(() => {
      useGameDataStore.setState({ gameData: replacementData })
    })
    rerender()
    expect(result.current.firstCalculation).not.toBe(previousCalculation)
    expect(result.current.firstCalculation).toBe(result.current.secondCalculation)
    expect(result.current.firstCalculation?.raceResolution.parentRace?.darkvision).toBe(60)
  })
})
