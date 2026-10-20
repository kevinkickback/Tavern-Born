import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getProficiencyCheckNoteRows } from '@/lib/calculations/proficiencyCheckNotes'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeConditionalCharacterFixture } from '../fixtures/conditionalProficiencyFixtures'
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

  test('shares source indexes across character edits while refreshing selection, suppression and current source authority', () => {
    const f = makeConditionalCharacterFixture('Fighter', 'XPHB')
    useGameDataStore.setState({ gameData: f.data })
    useCharacterStore.setState({
      activeCharacter: f.character,
      activeCharacterId: f.character.id,
      characters: [f.character],
    })
    const { result } = renderHook(() => {
      const character = useCharacterStore((state) => state.activeCharacter)
      return {
        data: useFilteredGameData(),
        first: useCharacterCalculationContext(character),
        second: useCharacterCalculationContext(character),
      }
    })
    const initialData = result.current.data
    const initialCatalog = result.current.first!.classChoices.catalogs
    const selected = f.select(['Fire Rune'])
    let previous = result.current.first
    const replace = (character: typeof selected) =>
      act(() => {
        useCharacterStore.setState({ activeCharacter: character, characters: [character] })
      })
    const activeRows = () =>
      getProficiencyCheckNoteRows(
        result.current.first!.effects.sourceDeclarations,
        result.current.first!.effects.resolutionContext,
      )
    expect(activeRows()).toEqual([])
    for (const change of [
      () => selected,
      () => ({ ...selected, name: 'Renamed' }),
      () => ({ ...selected, suppressedEffectIds: [activeRows()[0].effectId] }),
      () => f.select([], selected),
    ]) {
      const character = change()
      replace(character)
      expect(result.current.data).toBe(initialData)
      expect(result.current.first!.classChoices.catalogs).toBe(initialCatalog)
      expect(result.current.first).not.toBe(previous)
      expect(result.current.first).toBe(result.current.second)
      expect(activeRows()).toHaveLength(
        character.suppressedEffectIds?.length || !character.classChoiceSelections?.length ? 0 : 1,
      )
      previous = result.current.first
    }
    replace(selected)
    const note = activeRows()[0]
    replace({ ...selected, allowedSources: ['XPHB'] })
    expect(result.current.first!.classChoices.catalogs).not.toBe(initialCatalog)
    expect(activeRows()).toEqual([])
    replace(selected)
    expect(result.current.first!.classChoices.catalogs).toBe(initialCatalog)
    expect(activeRows()).toEqual([note])
    for (const replacement of [
      { ...f.data, optionalfeatures: [] },
      { ...f.data, classes: [] },
    ]) {
      act(() => {
        useGameDataStore.setState({ gameData: replacement })
      })
      expect(result.current.first!.classChoices.catalogs).not.toBe(initialCatalog)
      expect(activeRows()).toEqual([])
      act(() => {
        useGameDataStore.setState({ gameData: f.data })
      })
      expect(result.current.first!.classChoices.catalogs).toBe(initialCatalog)
      expect(activeRows()).toEqual([note])
    }
  })
})
