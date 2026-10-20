import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { LevelUpModal } from '@/components/modals/LevelUpModal'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeFixedCharacterFixture } from '../fixtures/fixedProficiencyFixtures'

afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
  for (const key of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'])
    Reflect.deleteProperty(HTMLElement.prototype, key)
})
test('actual multiclass UI keeps newly derived Scout grants with matching ownership and the new class grant', async () => {
  const f = makeFixedCharacterFixture()
  for (const key of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'])
    Object.defineProperty(HTMLElement.prototype, key, {
      value: vi.fn(() => false),
      configurable: true,
    })
  f.character.variantRules = { averageHitPoints: true }
  f.character.abilityScores.dexterity = 13
  f.character.abilityScores.strength = 13
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
  const user = userEvent.setup()
  render(<LevelUpModal open onOpenChange={() => {}} />)
  await user.click(screen.getByRole('combobox'))
  await user.click(await screen.findByRole('option', { name: /Fighter\s*\(PHB\)/ }))
  await user.click(screen.getByRole('button', { name: 'Add' }))
  const current = useCharacterStore.getState().activeCharacter!
  expect(current.classProgression.map((row) => [row.name, row.source, row.levels])).toEqual([
    ['Rogue', 'PHB', 3],
    ['Fighter', 'PHB', 1],
  ])
  expect(current.proficiencies.skills).toEqual(expect.arrayContaining(['nature', 'survival']))
  expect(current.proficiencies.expertise).toEqual(expect.arrayContaining(['nature', 'survival']))
  expect(current.proficiencies.armor).toEqual(expect.arrayContaining(['light', 'medium', 'shield']))
  expect(current.proficiencies.weapons).toEqual(expect.arrayContaining(['simple', 'martial']))
  expect(current.proficiencies.savingThrows).toEqual([])
  expect(current.hitPointGains?.[0]).toMatchObject({
    className: 'Fighter',
    classSource: 'PHB',
    classLevel: 1,
    characterLevel: 4,
    dieResult: 6,
    method: 'average',
  })
  expect(characterPersistenceSchema.safeParse(current).success).toBe(true)
  await user.click(screen.getByRole('button', { name: /Remove last level/ }))
  await user.click(screen.getByRole('button', { name: /^Remove$/ }))
  const restored = useCharacterStore.getState().activeCharacter!
  expect(restored.classProgression).toEqual(f.character.classProgression)
  expect(restored.proficiencies.skills).toEqual(expect.arrayContaining(['nature', 'survival']))
  expect(restored.proficiencies.expertise).toEqual(expect.arrayContaining(['nature', 'survival']))
  expect(restored.proficiencies.armor).toEqual([])
  expect(restored.proficiencies.weapons).toEqual([])
  expect(restored.hitPointGains).toEqual([])
  expect(characterPersistenceSchema.safeParse(restored).success).toBe(true)
})
