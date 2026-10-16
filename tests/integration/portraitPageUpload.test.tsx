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

  test('shows contextual lineage in the actual portrait preview without changing saved fields', () => {
    const character = useCharacterStore.getState().activeCharacter
    const { getByText } = render(<PortraitPage />)
    expect(getByText('Dragonborn (Draconblood: Brass)')).toBeTruthy()
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
