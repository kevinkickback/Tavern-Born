import { cleanup, render, screen, within } from '@testing-library/react'
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

  test('orders Actions first and uses it as the default section', () => {
    render(
      <MemoryRouter initialEntries={['/build/adjustments']}>
        <AdjustmentsPage />
      </MemoryRouter>,
    )

    const tabs = within(screen.getByRole('tablist', { name: 'Adjustment type' })).getAllByRole(
      'tab',
    )
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Actions', 'Effects'])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Manual Actions' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Current actions' })).toBeTruthy()
    expect(screen.getByText('Source-derived actions')).toBeTruthy()
    expect(document.querySelector('[data-slot="split-pane"]')).toBeTruthy()
    expect(screen.getByTitle('Collapse manual form panel')).toBeTruthy()
    expect(screen.getByTitle('Collapse current mechanics panel')).toBeTruthy()
  })

  test('preserves an explicit Effects deep link and can switch to Actions', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/build/adjustments?section=effects']}>
        <AdjustmentsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Manual Effects' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Current effects' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Actions' }))

    expect(screen.getByRole('heading', { name: 'Manual Actions' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
