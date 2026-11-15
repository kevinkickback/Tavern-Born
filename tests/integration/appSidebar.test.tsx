import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

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
    useAppPreferencesStore.setState({ secondarySidebarOpen: true })
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
  })

  afterEach(cleanup)

  test('maps build routes to the Builder workspace and active context page', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: 'Builder' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('complementary', { name: 'Builder navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Class' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Compendium' }).className).toContain(
      'text-[color:var(--navigation-foreground)]',
    )
    expect(screen.getByRole('link', { name: 'Race' }).className).toContain(
      'text-[color:var(--navigation-foreground)]',
    )
  })

  test('keeps actions and effects with character details and folds sources into Rules', () => {
    renderSidebar('/build/adjustments')

    expect(screen.getByText('Core')).toBeTruthy()
    expect(screen.getByText('Details')).toBeTruthy()
    expect(screen.getByText('Finish')).toBeTruthy()
    expect(screen.queryByText('Options')).toBeNull()
    expect(screen.queryByText('Character Core')).toBeNull()
    expect(screen.queryByText('Character Details')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Actions & Effects' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.queryByRole('link', { name: 'Rules' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Additional Content' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Rules' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Additional Content' })).toBeNull()
  })

  test('places Review in a final section after Core and Details', () => {
    renderSidebar('/build/review')

    const navigation = screen.getByRole('navigation', { name: 'Workspace pages' })
    const text = navigation.textContent ?? ''
    expect(text.indexOf('Core')).toBeLessThan(text.indexOf('Details'))
    expect(text.indexOf('Details')).toBeLessThan(text.indexOf('Finish'))
    expect(screen.getByRole('link', { name: /^Review/ }).getAttribute('aria-current')).toBe('page')
  })

  test('keeps application settings as a primary-rail utility', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Characters' }))

    expect(screen.getByRole('complementary', { name: 'Characters navigation' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  test('toggles the secondary sidebar from the primary rail without losing focus', async () => {
    const user = userEvent.setup()
    renderSidebar()

    const sidebar = screen.getByRole('complementary', { name: 'Builder navigation' })
    const toggle = screen.getByRole('button', { name: 'Collapse secondary sidebar' })
    expect(toggle.getAttribute('aria-controls')).toBe(sidebar.id)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'Expand secondary sidebar' })).toBe(toggle)
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(screen.queryByRole('link', { name: 'Class' })).toBeNull()
    expect(document.activeElement).toBe(toggle)

    await user.keyboard(' ')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('complementary', { name: 'Builder navigation' })).toBe(sidebar)
  })

  test('disables character-scoped workspaces until a character is active', () => {
    renderSidebar('/')

    expect(screen.getByRole('button', { name: 'Builder' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'Character Sheet' }).getAttribute('aria-disabled'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Rules' }).getAttribute('aria-disabled')).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Compendium' }).getAttribute('aria-disabled'),
    ).toBeNull()
  })

  test('enables character-scoped workspaces for the active character', () => {
    const character = makeCharacterFixture()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderSidebar('/')

    expect(screen.getByRole('button', { name: 'Builder' }).getAttribute('aria-disabled')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Character Sheet' }).getAttribute('aria-disabled'),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Rules' }).getAttribute('aria-disabled')).toBeNull()
  })

  test('orders the Rules workspace between Builder and Character Sheet', () => {
    renderSidebar('/')

    const labels = screen
      .getByRole('navigation', { name: 'Primary workspaces' })
      .querySelectorAll('button[aria-label]')
    expect(Array.from(labels, (button) => button.getAttribute('aria-label'))).toEqual([
      'Characters',
      'Builder',
      'Rules',
      'Character Sheet',
      'Compendium',
      'Collapse secondary sidebar',
      'Settings',
    ])
  })

  test('uses separate Character Rules and Additional Content pages in the Rules navigation', () => {
    renderSidebar('/sources')

    expect(screen.getByRole('button', { name: 'Rules' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Character Rules' }).getAttribute('aria-current')).toBe(
      null,
    )
    expect(
      screen.getByRole('link', { name: 'Additional Content' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.queryByRole('button', { name: 'Additional Content' })).toBeNull()
  })

  test('renders the permanent context pane for the compendium', () => {
    renderSidebar('/compendium')

    expect(screen.getByRole('complementary', { name: 'Compendium navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'All Entries' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('link', { name: 'Spells' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Items' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Weapon Masteries' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Class Features' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Subclass Features' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Creatures' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Organizations' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Item Types' })).toBeNull()
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

  test('offers official and custom templates under each rules edition', () => {
    renderSidebar('/character-sheet/2014/official')

    expect(
      screen.getByRole('button', { name: 'Character Sheet' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByText('5e (2014) Templates')).toBeTruthy()
    expect(screen.getByText('5.5e (2024) Templates')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: '5e (2014) Wizards of the Coast' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByRole('link', { name: '5e (2014) MorePurpleMoreBetter' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '5.5e (2024) Wizards of the Coast' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '5.5e (2024) Lost Loot' })).toBeTruthy()
  })

  test('shows a Settings sidebar and keeps a route back to the library', async () => {
    const user = userEvent.setup()
    renderSidebar('/settings')

    expect(screen.getByRole('complementary', { name: 'Settings navigation' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    )
    await user.click(screen.getByRole('button', { name: 'Characters' }))
    expect(screen.getByRole('complementary', { name: 'Characters navigation' })).toBeTruthy()
  })
})
