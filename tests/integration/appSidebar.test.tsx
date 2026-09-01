import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

function renderSidebar(path = '/build/class') {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppSidebar />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe('desktop workspace navigation', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('maps build routes to the Build workspace and active context page', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: 'Build' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('complementary', { name: 'Build navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Class' }).getAttribute('aria-current')).toBe('page')
  })

  test('keeps application settings as a primary-rail utility', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.getByRole('complementary', { name: 'Start navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Characters' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  test('keeps the context pane open without a collapse control', () => {
    renderSidebar()

    expect(screen.getByRole('complementary', { name: 'Build navigation' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /context pane/i })).toBeNull()
  })

  test('renders the permanent context pane for the compendium', () => {
    renderSidebar('/compendium')

    expect(screen.getByRole('complementary', { name: 'Compendium navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'All Entries' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('link', { name: 'Spells' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Items' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Optional Features' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cults & Boons' })).toBeTruthy()
  })

  test('marks a Compendium type shortcut active from the filter URL', () => {
    renderSidebar('/compendium?type=Spell')

    expect(screen.getByRole('link', { name: 'Spells' }).getAttribute('aria-current')).toBe('page')
    expect(
      screen.getByRole('link', { name: 'All Entries' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  test('offers separate 2014 and 2024 character-sheet templates', () => {
    renderSidebar('/character-sheet/2014')

    expect(
      screen.getByRole('button', { name: 'Character Sheet' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByRole('link', { name: '5e (2014)' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      screen.getByRole('link', { name: '5.5e (2024)' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  test('renders the permanent Start context pane for the character collection', () => {
    renderSidebar('/')

    expect(screen.getByRole('complementary', { name: 'Start navigation' })).toBeTruthy()
    expect(screen.getByText('Character Library')).toBeTruthy()
    expect(screen.getByText('Recent Characters')).toBeTruthy()
    expect(screen.getByText(/created and imported characters/i)).toBeTruthy()
  })

  test('uses recent characters as a quick, functional switcher', async () => {
    const user = userEvent.setup()
    const character = makeCharacterFixture({ name: 'Aelar', race: 'Elf', level: 3 })
    useCharacterStore.setState({ characters: [character] })

    renderSidebar('/')
    await user.click(screen.getByRole('button', { name: 'Open Aelar' }))

    expect(useCharacterStore.getState().activeCharacterId).toBe(character.id)
  })
})
