import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SourcesPage } from '@/pages/rules/SourcesPage'
import { SourcesPanel } from '@/pages/rules/SourcesPanel'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: () => null,
}))

const dataSourceFixture = vi.hoisted(() => ({ type: 'local' as 'local' | 'bundled' }))

vi.mock('@/store/gameDataStore', () => ({
  useGameDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      dataSourceConfig: { type: dataSourceFixture.type },
      gameData: {
        sources: [
          { name: "Player's Handbook", abbreviation: 'PHB', group: 'core' },
          { name: "Dungeon Master's Guide", abbreviation: 'DMG', group: 'core' },
          { name: "Dungeon Master's Guide (2024)", abbreviation: 'XDMG', group: 'core' },
          {
            name: 'Monster Manual',
            abbreviation: 'MM',
            group: 'core',
            hasCharacterOptions: false,
          },
          { name: "Xanathar's Guide to Everything", abbreviation: 'XGE', group: 'supplement' },
          {
            name: 'Eberron: Forge of the Artificer',
            abbreviation: 'EFA',
            group: 'setting',
            minimumRuleset: '2024',
          },
        ],
        spells: [],
      },
    }),
}))

describe('Rules Additional Content panel layout', () => {
  beforeEach(() => {
    dataSourceFixture.type = 'local'
    const character = makeCharacterFixture({ allowedSources: ['PHB', 'XGE'] })
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

  test('keeps the warning constrained above the source groups', () => {
    const { container } = render(<SourcesPanel />)

    const warning = screen.getByText('Source configuration notes').closest('aside')
    const sourceGroup = screen.getByText('Supplements')
    const allowedSourcesHeader = screen.getByText('Additional Content').closest('header')
    const selectedCount = container.querySelector('[data-allowed-sources-count]')
    const preferNewerToggle = screen.getByLabelText('Prefer Newer Printings')
    expect(warning).toBeTruthy()
    expect(container.querySelector('[data-slot="workspace-body"]')).toBeNull()
    expect(container.querySelector('[data-slot="workspace-toolbar"]')).toBeNull()
    expect(selectedCount?.textContent).toBe('2')
    expect(allowedSourcesHeader?.contains(selectedCount)).toBe(true)
    expect(
      allowedSourcesHeader?.contains(screen.getByRole('button', { name: 'Recommended' })),
    ).toBe(true)
    expect(allowedSourcesHeader?.contains(screen.getByRole('button', { name: 'Expanded' }))).toBe(
      true,
    )
    expect(allowedSourcesHeader?.contains(screen.getByRole('button', { name: 'None' }))).toBe(true)
    expect(warning?.contains(preferNewerToggle)).toBe(true)
    expect(warning?.className).toContain('rounded-md')
    expect(warning?.parentElement?.className).toContain(
      'max-w-[var(--workspace-collection-max-width)]',
    )
    expect(
      (warning?.compareDocumentPosition(sourceGroup) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  test('renders as its own page in the Rules workspace', () => {
    const { container } = render(
      <MemoryRouter>
        <SourcesPage />
      </MemoryRouter>,
    )

    expect(container.querySelector('[data-slot="workspace-body"]')).toBeTruthy()
    expect(screen.getByText('Additional Content')).toBeTruthy()
    expect(screen.queryByRole('tablist', { name: 'Rules category' })).toBeNull()
  })

  test('does not render provenance-only sources', () => {
    render(<SourcesPanel />)

    expect(screen.queryByRole('button', { name: /Monster Manual MM/ })).toBeNull()
  })

  test('explains bundled SRD source limits and links to Game Data settings', () => {
    dataSourceFixture.type = 'bundled'

    render(
      <MemoryRouter>
        <SourcesPanel />
      </MemoryRouter>,
    )

    expect(screen.getByText('Using the included SRD')).toBeTruthy()
    expect(screen.getByText(/does not provide additional sourcebooks/)).toBeTruthy()
    expect(screen.getByText(/add compatible 5etools data/)).toBeTruthy()
    expect(document.querySelector('[data-allowed-sources-count]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Settings → Game Data' }).getAttribute('href')).toBe(
      '/settings?section=data',
    )
    expect(screen.queryByRole('button', { name: 'Recommended' })).toBeNull()
  })

  test('removes a previously saved provenance-only source selection', async () => {
    const character = makeCharacterFixture({ allowedSources: ['PHB', 'MM'] })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<SourcesPanel />)

    await waitFor(() => {
      expect(useCharacterStore.getState().activeCharacter?.allowedSources).toEqual(['PHB'])
    })
  })

  test('updates the source note when newer printings are preferred', async () => {
    const user = userEvent.setup()
    render(<SourcesPanel />)

    expect(screen.getByText(/Prefer Newer Printings can remove those duplicates/)).toBeTruthy()

    await user.click(screen.getByLabelText('Prefer Newer Printings'))

    expect(screen.getByText(/Older printings are hidden where a newer version exists/)).toBeTruthy()
    expect(useCharacterStore.getState().activeCharacter?.variantRules?.preferNewerPrintings).toBe(
      true,
    )
  })

  test('disables revised core and revised-only sources for a 2014 character', () => {
    render(<SourcesPanel />)

    expect(
      screen.getByRole('button', { name: /Dungeon Master's Guide DMG/ }).hasAttribute('disabled'),
    ).toBe(false)
    expect(
      screen
        .getByRole('button', { name: /Dungeon Master's Guide \(2024\).*XDMG/ })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: /Eberron: Forge of the Artificer.*EFA/ })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  test('disables legacy core counterparts for a 2024 character', () => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['DMG', 'XDMG'],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<SourcesPanel />)

    expect(
      screen.getByRole('button', { name: /Dungeon Master's Guide DMG/ }).hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: /Dungeon Master's Guide \(2024\).*XDMG/ })
        .hasAttribute('disabled'),
    ).toBe(false)
    expect(screen.getByLabelText('Prefer Newer Printings').hasAttribute('disabled')).toBe(true)
  })
})
