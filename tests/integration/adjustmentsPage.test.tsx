import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AdjustmentsPage } from '@/pages/adjustments/AdjustmentsPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('AdjustmentsPage', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({ manualActions: [], manualEffects: [] })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('hosts manual effects and actions as page tabs instead of dialogs', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/build/adjustments?section=effects']}>
        <AdjustmentsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Manual Effects' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Actions' }))

    expect(screen.getByRole('heading', { name: 'Manual Actions' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
