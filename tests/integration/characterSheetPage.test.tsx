import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
    expect(within(header).queryByRole('button', { name: 'Zoom in' })).toBeNull()
    expect(
      within(screen.getByRole('contentinfo')).getByRole('button', { name: 'Zoom in' }),
    ).toBeTruthy()
    expect(screen.queryByText('Not generated')).toBeNull()
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
    expect(screen.getByRole('button', { name: 'Dismiss PDF options hint' })).toBeTruthy()
    screen.getByRole('button', { name: 'Optional Pages' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: 'Dismiss PDF options hint' })).toBeNull()
    expect(isHintDismissed('character-sheet-options-v2')).toBe(true)
    await user.keyboard('{Escape}')
    first.unmount()
    renderPage()
    expect(screen.queryByRole('button', { name: 'Dismiss PDF options hint' })).toBeNull()
    act(() => resetAllHints())
    expect(screen.getByRole('button', { name: 'Dismiss PDF options hint' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Dismiss PDF options hint' }))
    expect(isHintDismissed('character-sheet-options-v2')).toBe(true)
  })

  test.each([false, true])('downloads directly with fit-only warnings: %s', async (hasFitIssue) => {
    const result = {
      issues: hasFitIssue
        ? [
            {
              id: 'capacity:equipment',
              category: 'truncation' as const,
              severity: 'warning' as const,
              title: 'Equipment left out of this PDF',
              detail: 'Extra equipment exceeds the sheet.',
            },
          ]
        : [],
      warningCount: hasFitIssue ? 1 : 0,
      blockingCount: 0,
    }
    vi.mocked(getPdfExportPreflight).mockReturnValueOnce(result).mockReturnValueOnce(result)
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

  test('keeps readiness warnings but excludes fitting warnings from download confirmation', async () => {
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
    expect(screen.getByRole('button', { name: 'Optional Pages' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText(/Character choices to review/)).toBeTruthy()
    expect(screen.queryByText('Content that may not fit')).toBeNull()
    expect(screen.queryByText('Backstory was shortened on this sheet')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Go Back' }))
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.queryByText('Backstory was shortened on this sheet')).toBeNull()
  })

  test('does not enable notes for spell overflow when spell pages are excluded', async () => {
    const user = userEvent.setup()
    const character = makeCharacterFixture()
    character.spells.spellProfiles[1].spellsKnown = ['Shield|PHB']
    useCharacterStore.setState({ activeCharacter: character })
    localStorage.setItem(
      'tb:sheet-export-preferences:v1',
      JSON.stringify({
        [`${character.id}:2014-official`]: {
          pages: { spells: false },
          content: { spells: [] },
          text: { overflow: 'notes' },
        },
      }),
    )
    render(
      <MemoryRouter>
        <CharacterSheetPage templateId="2014-official" />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Optional Pages' }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Notes page' }).getAttribute('data-state'),
    ).toBe('unchecked')
  })

  test('remembers content choices across visits, invalidates the preview, and leaves equipment untouched', async () => {
    const user = userEvent.setup()
    const character = makeCharacterFixture({
      equipment: [
        {
          id: 'blade',
          name: 'Longsword',
          source: 'PHB',
          type: 'M',
          dmg1: '1d8',
          dmgType: 'S',
          quantity: 1,
          equipped: true,
          weight: 3,
        },
      ],
    })
    useCharacterStore.setState({ activeCharacter: character })
    const first = renderPage()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    expect(screen.queryByRole('checkbox', { name: /Longsword/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Attacks/ }))
    await user.click(
      within(screen.getByRole('region', { name: 'Attacks' })).getByRole('checkbox', {
        name: /Longsword/,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('PDF preview')).toBeNull()
    expect(useCharacterStore.getState().activeCharacter?.equipment[0].equipped).toBe(true)
    first.unmount()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    await user.click(screen.getByRole('button', { name: /^Attacks/ }))
    expect(
      within(screen.getByRole('region', { name: 'Attacks' }))
        .getByRole('checkbox', { name: /Longsword/ })
        .getAttribute('aria-checked'),
    ).toBe('false')
    await user.click(screen.getByRole('button', { name: /^Inventory/ }))
    expect(screen.queryByRole('region', { name: 'Attacks' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Inventory' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^Attacks/ }))
    await user.click(screen.getByRole('button', { name: 'Automatic attacks' }))
    expect(
      within(screen.getByRole('region', { name: 'Attacks' }))
        .getByRole('checkbox', { name: /Longsword/ })
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  test('remembers description settings and invalidates the preview without changing the character', async () => {
    const user = userEvent.setup()
    const before = useCharacterStore.getState().activeCharacter
    const first = renderPage()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    screen.getByRole('combobox', { name: 'Rules descriptions' }).focus()
    await user.keyboard('{Enter}{End}{Enter}')
    expect(screen.getByRole('combobox', { name: 'Long text & extra entries' }).textContent).toBe(
      'Shorten with ellipsis',
    )
    screen.getByRole('combobox', { name: 'Long text & extra entries' }).focus()
    await user.keyboard('{Enter}{End}{Enter}')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('PDF preview')).toBeNull()
    first.unmount()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    expect(screen.getByRole('combobox', { name: 'Rules descriptions' }).textContent).toBe(
      'Names only',
    )
    expect(screen.getByRole('combobox', { name: 'Long text & extra entries' }).textContent).toBe(
      'Continue in notes',
    )
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    expect(vi.mocked(generateFilledCharacterSheetPdf).mock.calls.slice(-1)[0]?.[3]?.text).toEqual({
      descriptions: 'names',
      overflow: 'notes',
    })
    expect(useCharacterStore.getState().activeCharacter).toBe(before)
  })
})
