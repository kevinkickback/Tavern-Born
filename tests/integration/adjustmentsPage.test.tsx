import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AdjustmentsPage } from '@/pages/adjustments/AdjustmentsPage'
import { SourceDerivedActions } from '@/pages/adjustments/components/DerivedMechanicsOverview'
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

  test('orders Actions first, uses it by default, and collapses both action groups', async () => {
    const user = userEvent.setup()
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

    const sourceActions = screen.getByRole('button', { name: /Source-derived actions/ })
    const manualActions = screen.getByRole('button', { name: /Manual actions/ })
    expect(sourceActions.getAttribute('aria-expanded')).toBe('true')
    expect(manualActions.getAttribute('aria-expanded')).toBe('true')
    await user.click(sourceActions)
    await user.click(manualActions)
    expect(sourceActions.getAttribute('aria-expanded')).toBe('false')
    expect(manualActions.getAttribute('aria-expanded')).toBe('false')
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

    const sourceEffects = screen.getByRole('button', { name: /Source-derived effects/ })
    const manualEffects = screen.getByRole('button', { name: /Manual effects/ })
    expect(sourceEffects.getAttribute('aria-expanded')).toBe('true')
    expect(manualEffects.getAttribute('aria-expanded')).toBe('true')
    await user.click(sourceEffects)
    await user.click(manualEffects)
    expect(sourceEffects.getAttribute('aria-expanded')).toBe('false')
    expect(manualEffects.getAttribute('aria-expanded')).toBe('false')

    await user.click(screen.getByRole('tab', { name: 'Actions' }))

    expect(screen.getByRole('heading', { name: 'Manual Actions' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('limits the source list to action-sized projections', () => {
    render(
      <SourceDerivedActions
        actions={[
          {
            id: 'source-action',
            name: 'Action-sized rule',
            kind: 'action',
            description: 'Explicit action rules.',
            source: { kind: 'race', name: 'Fixture source' },
            active: true,
          },
          {
            id: 'source-passive',
            name: 'Passive rule',
            kind: 'special',
            description: 'Passive rules text.',
            source: { kind: 'race', name: 'Fixture source' },
            active: true,
          },
        ]}
      />,
    )

    expect(screen.getByText('Action-sized rule')).toBeTruthy()
    expect(screen.queryByText('Passive rule')).toBeNull()
  })
})
