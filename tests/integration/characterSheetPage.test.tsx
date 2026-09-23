import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { generateFilledCharacterSheetPdf } from '@/lib/pdf/characterSheetPdf'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { isHintDismissed, resetAllHints } from '@/lib/storage/hints'
import { CharacterSheetPage } from '@/pages/CharacterSheetPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/components/PdfCanvasPreview', () => ({
  PdfCanvasPreview: () => <div>PDF preview</div>,
}))

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: ({ enabled }: { enabled: boolean }) =>
    enabled ? { reference: document.body, gap: 12, placement: 'bottom' } : null,
}))

vi.mock('@/lib/pdf/characterSheetPdf', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pdf/characterSheetPdf')>()
  return {
    ...original,
    generateFilledCharacterSheetPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
  }
})

vi.mock('@/lib/pdf/exportPreflight', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pdf/exportPreflight')>()
  return { ...original, getPdfExportPreflight: vi.fn(original.getPdfExportPreflight) }
})

describe('CharacterSheetPage', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <CharacterSheetPage templateId="2014" />
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    const hintStorage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => hintStorage.get(key) ?? null,
      setItem: (key: string, value: string) => hintStorage.set(key, value),
      removeItem: (key: string) => hintStorage.delete(key),
      key: (index: number) => [...hintStorage.keys()][index] ?? null,
      get length() {
        return hintStorage.size
      },
    })
    const character = makeCharacterFixture()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  test('uses the flat workspace layout with full-width export controls', () => {
    const { container } = renderPage()

    const workspacePage = container.querySelector('[data-slot="workspace-page"]')
    const workspaceBody = container.querySelector('[data-slot="workspace-body"]')
    const header = screen.getByRole('banner')

    expect(workspacePage?.firstElementChild).toBe(header)
    expect(header.nextElementSibling).toBe(workspaceBody)
    expect(workspacePage?.className).not.toContain('p-3')
    expect(workspaceBody?.className).not.toContain('rounded-lg')
    expect(workspaceBody?.className).not.toContain('border-border')
    expect(workspaceBody?.className).not.toContain('bg-workspace-pane')
    expect(workspaceBody?.className).not.toContain('bg-workspace-detail')
    expect(container.querySelector('[data-slot="workspace-toolbar"]')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Character sheet controls' })).toBeTruthy()
    expect(screen.queryByText('2014 Character Sheet')).toBeNull()
    expect(screen.getByText('MorePurpleMoreBetter (2014)')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'PDF attribution' }).getAttribute('href')).toBe(
      '/settings?section=about#character-sheet-pdf-2014-custom',
    )
    expect((screen.getByRole('button', { name: 'Regenerate' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByRole('button', { name: 'Generate Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy()
  })

  test('runs an export preflight before downloading a sheet', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))

    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('Before you download')).toBeTruthy()
    const summary = screen.getByText(/Character choices to review/)
    expect(summary.closest('details')?.open).toBe(false)
    await user.click(summary)
    expect(summary.closest('details')?.open).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Go Back' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('dismisses the Optional Pages hint when the menu is opened and remembers it across visits', async () => {
    const user = userEvent.setup()
    const first = renderPage()
    expect(screen.getByRole('button', { name: 'Dismiss Optional Pages hint' })).toBeTruthy()
    screen.getByRole('button', { name: 'Optional Pages' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: 'Dismiss Optional Pages hint' })).toBeNull()
    expect(isHintDismissed('character-sheet-optional-pages')).toBe(true)
    await user.keyboard('{Escape}')
    first.unmount()
    renderPage()
    expect(screen.queryByRole('button', { name: 'Dismiss Optional Pages hint' })).toBeNull()
    act(() => resetAllHints())
    expect(screen.getByRole('button', { name: 'Dismiss Optional Pages hint' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Dismiss Optional Pages hint' }))
    expect(isHintDismissed('character-sheet-optional-pages')).toBe(true)
  })

  test('downloads directly when there are no warnings', async () => {
    vi.mocked(getPdfExportPreflight).mockReturnValueOnce({
      issues: [],
      warningCount: 0,
      blockingCount: 0,
    })
    // Generation updates the fitting warnings and recalculates preflight.
    vi.mocked(getPdfExportPreflight).mockReturnValueOnce({
      issues: [],
      warningCount: 0,
      blockingCount: 0,
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  })

  test('changing optional pages invalidates the preview and passes choices to export', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Optional Pages' }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Companion page' }).getAttribute('data-state'),
    ).toBe('unchecked')
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Notes page' }).getAttribute('data-state'),
    ).toBe('checked')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Optional Pages' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Notes page' }))
    expect(screen.getByRole('menu', { name: 'Optional Pages' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Optional Pages' }))
    expect(screen.queryByText('PDF preview')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Download PDF' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    expect(vi.mocked(generateFilledCharacterSheetPdf).mock.calls.slice(-1)[0]?.[3]?.pages).toEqual({
      notes: false,
    })
  })

  test('includes actual fitting warnings and replaces them after regeneration', async () => {
    const user = userEvent.setup()
    vi.mocked(generateFilledCharacterSheetPdf).mockImplementationOnce(
      (_vm, _bytes, _id, options) => {
        options?.onTextTruncated?.('Text_89')
        return Promise.resolve(new Uint8Array([1, 2, 3]))
      },
    )
    render(
      <MemoryRouter>
        <CharacterSheetPage templateId="2024-official" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Optional Pages' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.getByText('Backstory was shortened on this sheet')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Go Back' }))
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.queryByText('Backstory was shortened on this sheet')).toBeNull()
  })
})
