import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PortraitPage } from '@/pages/details/PortraitPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

function resetCharacterStore() {
  const character = makeCharacterFixture({
    id: 'portrait-1',
    name: 'Portrait',
    race: 'Dragonborn',
    raceSource: 'PHB',
    subrace: 'Dragonborn (Draconblood; Brass)',
    subraceSource: 'EGW',
  })
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
    isActiveCharacterDirty: false,
  })
}

describe('PortraitPage upload guards', () => {
  beforeEach(() => {
    resetCharacterStore()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('shows the base race in the portrait card without changing saved lineage', () => {
    const character = useCharacterStore.getState().activeCharacter
    const { getByText, queryByText } = render(<PortraitPage />)
    expect(getByText('Dragonborn')).toBeTruthy()
    expect(queryByText('Dragonborn (Draconblood: Brass)')).toBeNull()
    expect(useCharacterStore.getState().activeCharacter).toBe(character)
    expect(character?.subrace).toBe('Dragonborn (Draconblood; Brass)')
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  })

  test('rejects non-image uploads', async () => {
    const user = userEvent.setup()
    render(<PortraitPage />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()

    const nonImage = new File(['not-an-image'], 'notes.txt', {
      type: 'text/plain',
    })

    await user.upload(input, nonImage)

    expect(useCharacterStore.getState().activeCharacter?.portrait).toBeUndefined()
  })
})
