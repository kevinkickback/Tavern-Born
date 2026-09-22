import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CharacterSheetPage } from '@/pages/CharacterSheetPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/components/PdfCanvasPreview', () => ({
  PdfCanvasPreview: () => <div>PDF preview</div>,
}))

vi.mock('@/lib/pdf/characterSheetPdf', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pdf/characterSheetPdf')>()
  return {
    ...original,
    generateFilledCharacterSheetPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
  }
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
    expect(
      screen.getByText("MorePurpleMoreBetter's D&D 5th Edition Character Record Sheet (5e 2014)"),
    ).toBeTruthy()
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
    expect(screen.getByText('PDF export preflight')).toBeTruthy()
    expect(screen.getAllByText('Readiness').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Download with Warnings' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Go Back' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
