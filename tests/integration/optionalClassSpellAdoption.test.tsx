import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { OptionalClassFeatures } from '@/pages/build/class/components/OptionalClassFeatures'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeOptionalClassSpellFixtures } from '../fixtures/optionalClassSpellFixtures'

const fixture = makeOptionalClassSpellFixtures()
function Flow() {
  const character = useCharacterStore((state) => state.activeCharacter)!
  return (
    <OptionalClassFeatures
      character={character}
      className="Cleric"
      classSource="PHB"
      level={1}
      activity={createOptionalClassFeatureActivity(character, fixture.context.catalogs)}
      onSelectFeature={() => {}}
    />
  )
}
beforeEach(() => {
  resetCharacterStore()
  const character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Cleric', source: 'PHB', levels: 5 }],
    variantRules: { optionalClassFeatures: true },
  })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  useGameDataStore.setState({ gameData: fixture.gameData })
  setActiveCharacter(character)
  vi.spyOn(toast, 'error').mockImplementation(() => 'toast')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

test('existing Class checkbox adopts a spell section without preparing spells or losing a latest unrelated edit', () => {
  render(<Flow />)
  const button = screen.getByRole('checkbox', { name: /Additional Cleric Spells/ })
  const before = useCharacterStore.getState().activeCharacter!
  act(() => {
    useCharacterStore.setState({ activeCharacter: { ...before, name: 'Latest name' } })
    fireEvent.click(button)
  })
  const saved = useCharacterStore.getState().activeCharacter!
  expect(saved.name).toBe('Latest name')
  expect(saved.optionalClassFeatureAdoptions).toEqual([
    { owner: ['class', 'cleric', 'phb'], target: 'book-section|tce|09f', earnedLevel: 1 },
  ])
  expect(saved.spells).toEqual(before.spells)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test.each([
  'catalog',
  'source settings',
] as const)('a captured new adoption rejects changed %s', (change) => {
  render(<Flow />)
  const button = screen.getByRole('checkbox', { name: /Additional Cleric Spells/ })
  act(() => {
    if (change === 'catalog')
      useGameDataStore.setState({ gameData: { ...fixture.gameData, optionalClassSections: [] } })
    else
      useCharacterStore.setState({
        activeCharacter: {
          ...useCharacterStore.getState().activeCharacter!,
          allowedSources: ['PHB'],
        },
      })
    fireEvent.click(button)
  })
  expect(
    useCharacterStore.getState().activeCharacter!.optionalClassFeatureAdoptions,
  ).toBeUndefined()
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/sources changed/))
})

test('captured Clear stays source-free after the catalog disappears', () => {
  render(<Flow />)
  fireEvent.click(screen.getByRole('checkbox', { name: /Additional Cleric Spells/ }))
  const button = screen.getByRole('checkbox', { name: /Additional Cleric Spells/ })
  act(() => {
    useGameDataStore.setState({ gameData: null })
    fireEvent.click(button)
  })
  expect(useCharacterStore.getState().activeCharacter!.optionalClassFeatureAdoptions).toEqual([])
  expect(toast.error).not.toHaveBeenCalled()
})
