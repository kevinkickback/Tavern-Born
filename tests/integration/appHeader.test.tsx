import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppHeader } from '@/components/layout/AppHeader'
import { setHintDismissed } from '@/lib/storage/hints'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/components/modals/LevelUpModal', () => ({
  LevelUpModal: () => null,
}))

vi.mock('@/components/modals/ArmorClassModal', () => ({
  ArmorClassModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="armor-class-modal-mock" /> : null,
}))

vi.mock('@/components/modals/HitPointsModal', () => ({
  HitPointsModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="hit-points-modal-mock" /> : null,
}))

vi.mock('@/hooks/character/useArmorClass', () => ({
  useArmorClass: () => ({
    calculatedAC: 17,
    effectiveAC: 18,
    setAC: vi.fn(),
  }),
}))

vi.mock('@/hooks/character/useHitPoints', () => ({
  useHitPoints: () => ({
    hitPoints: { max: 42, current: 37, temporary: 0 },
    calculatedMaxHP: 40,
    effectiveMaxHP: 42,
    hitDie: 10,
    conMod: 2,
    levelsHPBreakdown: [0, 12, 8, 8, 7, 7],
    setCurrentHP: vi.fn(),
    setTempHP: vi.fn(),
    heal: vi.fn(),
    damage: vi.fn(),
  }),
}))

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: ({ enabled }: { enabled: boolean }) =>
    enabled ? { top: 40, left: 40, arrowLeft: 20, anchorTop: 20, gap: 12 } : null,
}))

describe('app header character summary', () => {
  beforeEach(() => {
    setHintDismissed('header-stat-management-menus', false)
    const character = makeCharacterFixture({
      name: 'Aelar',
      race: 'Elf',
      class: 'Fighter',
      level: 2,
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 3 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
      ],
    })

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

  test('should show names directly for one or two classes without a tooltip', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByText('Aelar')).toBeTruthy()
    const summary = screen.getByText('Elf · Level 5 · Fighter / Wizard')
    expect(summary).toBeTruthy()
    expect(summary.getAttribute('data-slot')).toBeNull()
  })

  test('condenses three or more classes and shows their breakdown on hover', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState((state) => ({
      activeCharacter: state.activeCharacter
        ? {
            ...state.activeCharacter,
            race: 'Aasimar',
            classProgression: [
              { name: 'Artificer', source: 'PHB', levels: 1 },
              { name: 'Wizard', source: 'PHB', levels: 1 },
              { name: 'Warlock', source: 'PHB', levels: 1 },
              { name: 'Druid', source: 'PHB', levels: 1 },
              { name: 'Rogue', source: 'PHB', levels: 1 },
              { name: 'Paladin', source: 'PHB', levels: 1 },
            ],
          }
        : null,
    }))

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    const summary = screen.getByText('Aasimar · Level 6 · 6 classes')
    await user.hover(summary)
    expect((await screen.findByRole('tooltip')).textContent).toBe(
      'Classes: Artificer 1 · Wizard 1 · Warlock 1 · Druid 1 · Rogue 1 · Paladin 1',
    )
  })

  test('should show current AC and max HP in icon badges', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('header-ac-badge').textContent).toContain('Armor Class 18')
    expect(screen.getByTestId('header-hp-badge').textContent).toContain('Maximum Hit Points 42')
    expect(screen.getByText('18')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
  })

  test('opens hit-point management from the heart badge', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Manage hit points. Maximum 42' }))
    expect(screen.getByTestId('hit-points-modal-mock')).toBeTruthy()
  })

  test('opens Armor Class management from the shield badge', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Manage Armor Class. Current 18' }))
    expect(screen.getByTestId('armor-class-modal-mock')).toBeTruthy()
  })

  test('introduces the shield and heart menus once on the Race page', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/build/race']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole('status').textContent).toContain(
      'Click the shield or heart to manage Armor Class and Hit Points',
    )
    await user.click(
      screen.getByRole('button', { name: 'Dismiss Armor Class and Hit Points hint' }),
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('keeps level up contextual while leaving save persistently visible', () => {
    render(
      <MemoryRouter initialEntries={['/compendium']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Level up character' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save character' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  test('shows level up in the build workspace', () => {
    render(
      <MemoryRouter initialEntries={['/build/race']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(
      screen
        .getByRole('button', { name: 'Level up character' })
        .getAttribute('data-level-up-button'),
    ).toBe('true')
    expect(screen.getByText('Race')).toBeTruthy()
  })

  test('keeps level up available throughout Character Details', () => {
    render(
      <MemoryRouter initialEntries={['/details/portrait']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Level up character' })).toBeTruthy()
    expect(screen.getByText('Portrait')).toBeTruthy()
  })

  test('treats Character Rules as part of the Builder workspace', () => {
    render(
      <MemoryRouter initialEntries={['/rules']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Level up character' })).toBeTruthy()
    expect(screen.getByText('Character Rules')).toBeTruthy()
  })

  test('omits level up from the separate Character Sheet workspace', () => {
    render(
      <MemoryRouter initialEntries={['/character-sheet/2024']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Level up character' })).toBeNull()
    expect(screen.getByText('Character Sheet')).toBeTruthy()
  })

  test('uses the active character portrait when one is available', () => {
    const portrait = 'data:image/png;base64,cG9ydHJhaXQ='
    useCharacterStore.setState((state) => ({
      activeCharacter: state.activeCharacter ? { ...state.activeCharacter, portrait } : null,
    }))

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole('img', { name: 'Aelar portrait' }).getAttribute('src')).toBe(portrait)
  })
})
