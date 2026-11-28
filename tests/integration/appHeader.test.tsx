import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('app header character summary', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      name: 'Aelar',
      race: 'Elf',
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

  afterEach(cleanup)

  test.each([
    ['/build/background', 'Background'],
    ['/feats', 'Feats'],
    ['/details/conditions', 'Conditions'],
    ['/build/adjustments', 'Actions & Effects'],
  ])('uses the sidebar icon in the %s page header', (path, title) => {
    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppSidebar />
          <AppHeader />
        </MemoryRouter>
      </TooltipProvider>,
    )

    const headerIcon = screen.getByRole('heading', { name: title }).previousElementSibling
    const sidebarIcon = screen.getByRole('link', { name: title }).querySelector('svg')

    expect(headerIcon?.tagName.toLowerCase()).toBe('svg')
    expect(sidebarIcon).not.toBeNull()
    expect(headerIcon?.innerHTML).toBe(sidebarIcon?.innerHTML)
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

  test('keeps contextual lineage in the header without changing the character', () => {
    const character = {
      ...useCharacterStore.getState().activeCharacter!,
      subrace: 'Elf (High; Moon)',
      subraceSource: 'PHB',
    }
    useCharacterStore.setState({ activeCharacter: character, isActiveCharacterDirty: false })
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )
    expect(screen.getByText('Elf (High: Moon) · Level 5 · Fighter / Wizard')).toBeTruthy()
    expect(useCharacterStore.getState().activeCharacter).toBe(character)
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
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

  test('keeps the stat controls in Overview instead of the page header', () => {
    render(
      <MemoryRouter initialEntries={['/build/overview']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /Manage Armor Class/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Manage Hit Points/i })).toBeNull()
  })

  test('keeps rest controls out of the builder header', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Preview a rest' })).toBeNull()
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
    expect(screen.queryByRole('button', { name: 'Manage manual effects' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Manage manual actions' })).toBeNull()
  })

  test('does not advertise an unimplemented save keyboard shortcut', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({ isActiveCharacterDirty: true })
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    await user.hover(screen.getByRole('button', { name: 'Save character' }))
    expect((await screen.findByRole('tooltip')).textContent).toBe('Save character')
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

  test('keeps Character Rules outside Builder-only level-up actions', () => {
    render(
      <MemoryRouter initialEntries={['/rules']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Level up character' })).toBeNull()
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
