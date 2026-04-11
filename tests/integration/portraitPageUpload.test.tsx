import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PortraitPage } from '@/pages/details/PortraitPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

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
  })
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
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
