import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CharacterCreationWizard } from '@/components/character/wizard/CharacterCreationWizard'
import type { CharacterWizardData } from '@/components/character/wizard/types'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeRaceFixture,
} from '../fixtures/gameDataFixtures'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/character/wizard/validation', () => ({
  validateStep: () => ({ valid: true }),
}))
vi.mock('@/hooks/data/useWizardGameData', () => ({
  useWizardGameData: () => {
    const race = makeRaceFixture({ name: 'Human', source: 'PHB' })
    const classEntity = makeClassFixture({ name: 'Fighter', source: 'PHB' })
    const background = { name: 'Soldier', source: 'PHB' }
    return {
      ...makeGameDataFixture(),
      races: [race],
      classes: [classEntity],
      backgrounds: [background],
      sources: [{ abbreviation: 'PHB', name: 'Player Handbook' }],
      itemLookup: {},
      resolveRace: () => ({ parentRace: race }),
      resolveClass: () => classEntity,
      resolveBackground: () => background,
    }
  },
}))
vi.mock('@/components/character/wizard/steps', () => ({
  BasicsStep: ({
    data,
    onChange,
  }: {
    data: CharacterWizardData
    onChange: (patch: Partial<CharacterWizardData>) => void
  }) => (
    <input
      aria-label="Character name"
      value={data.name}
      onChange={(event) =>
        onChange({
          name: event.target.value,
          originSystem: '2014',
          race: 'Human',
          raceSource: 'PHB',
          class: 'Fighter',
          classSource: 'PHB',
          background: 'Soldier',
          backgroundSource: 'PHB',
        })
      }
    />
  ),
  RulesStep: () => null,
  RaceStep: () => null,
  ClassStep: () => null,
  BackgroundStep: () => null,
  AbilityScoresStep: () => null,
  ReviewStep: ({ data }: { data: CharacterWizardData }) => <p>Review {data.name}</p>,
}))

const addCharacter = useCharacterStore.getState().addCharacter
beforeEach(() => {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
    isActiveCharacterDirty: false,
    addCharacter,
  })
  useGameDataStore.setState({ gameData: null, dataSourceConfig: null })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useCharacterStore.setState({ addCharacter })
})

test('keeps wizard input and permits retry after a delayed creation failure', async () => {
  const user = userEvent.setup()
  const onOpenChange = vi.fn()
  let rejectWrite: (error: Error) => void = () => undefined
  const creation = vi.spyOn(useCharacterStore.getState(), 'addCharacter').mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectWrite = reject
      }),
  )
  render(<CharacterCreationWizard open onOpenChange={onOpenChange} />)
  await user.type(screen.getByRole('textbox', { name: 'Character name' }), 'Recoverable Hero')
  for (let step = 1; step < 7; step++)
    await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  expect(screen.getByRole('button', { name: 'Creating…' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Close' }).hasAttribute('disabled')).toBe(true)
  await user.keyboard('{Escape}')
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(toast.success).not.toHaveBeenCalled()
  expect(useCharacterStore.getState().characters).toEqual([])

  await act(() => {
    rejectWrite(new Error('Storage unavailable'))
  })
  expect(screen.getByText('Review Recoverable Hero')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('Storage unavailable')
  expect(onOpenChange).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(creation).toHaveBeenCalledTimes(2)
  expect(toast.success).toHaveBeenCalledWith('Character created')
  expect(useCharacterStore.getState().characters).toHaveLength(1)
  expect(useCharacterStore.getState().activeCharacter?.name).toBe('Recoverable Hero')
})
