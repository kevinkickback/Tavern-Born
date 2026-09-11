import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SourcesPage } from '@/pages/sources/SourcesPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: () => null,
}))

vi.mock('@/store/gameDataStore', () => ({
  useGameDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      gameData: {
        sources: [
          { name: "Player's Handbook", abbreviation: 'PHB', group: 'core' },
          { name: "Xanathar's Guide to Everything", abbreviation: 'XGE', group: 'supplement' },
        ],
        spells: [],
      },
    }),
}))

describe('SourcesPage layout', () => {
  beforeEach(() => {
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
    const { container } = render(<SourcesPage />)

    const warning = screen.getByText('Source configuration notes').closest('aside')
    const sourceGroup = screen.getByText('Supplements')
    const workspaceBody = container.querySelector('[data-slot="workspace-body"]')
    const allowedSourcesHeader = screen.getByText('Allowed sources').closest('header')
    const selectedCount = container.querySelector('[data-allowed-sources-count]')
    const preferNewerToggle = screen.getByLabelText('Prefer Newer Printings')
    expect(warning).toBeTruthy()
    expect(workspaceBody?.className).not.toContain('bg-workspace-pane')
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

  test('updates the source note when newer printings are preferred', async () => {
    const user = userEvent.setup()
    render(<SourcesPage />)

    expect(screen.getByText(/Prefer Newer Printings can remove those duplicates/)).toBeTruthy()

    await user.click(screen.getByLabelText('Prefer Newer Printings'))

    expect(screen.getByText(/Older printings are hidden where a newer version exists/)).toBeTruthy()
    expect(useCharacterStore.getState().activeCharacter?.variantRules?.preferNewerPrintings).toBe(
      true,
    )
  })
})
