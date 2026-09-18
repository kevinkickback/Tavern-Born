import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { GameContent } from '@/components/editor/GameContent'
import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { buildRecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { SpellNameTooltip } from '@/pages/spells/components/SpellNameTooltip'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Spell5e } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

function renderWithManager(ui: React.ReactNode) {
  return render(<RulesPreviewManager>{ui}</RulesPreviewManager>)
}

describe('rules previews', () => {
  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
  })

  test('uses the app game-data lookup through the canonical content component', () => {
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        conditions: [{ name: 'Prone', source: 'PHB', entries: ['Canonical preview text.'] }],
      }),
    })

    renderWithManager(<GameContent entry="The target is {@condition Prone|PHB}." />)
    fireEvent.mouseMove(screen.getByRole('button', { name: 'Prone' }))

    expect(screen.getByRole('dialog', { name: 'Prone preview' }).textContent).toContain(
      'Canonical preview text.',
    )
  })

  test('uses hover intent and rolls the two-preview chain without replacing its active parent', async () => {
    const recursiveLookup = buildRecursiveLookup({
      conditions: [
        { name: 'First', source: 'PHB', entries: ['First points to {@condition Second|PHB}.'] },
        { name: 'Second', source: 'PHB', entries: ['Second points to {@condition Third|PHB}.'] },
        { name: 'Third', source: 'PHB', entries: ['Short third details.'] },
      ],
    })

    renderWithManager(
      <RenderedEntryWithTooltip
        entry="Start with {@condition First|PHB}."
        recursiveLookup={recursiveLookup}
      />,
    )

    const firstTrigger = screen.getByRole('button', { name: 'First' })
    fireEvent.mouseMove(firstTrigger)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(firstTrigger.getAttribute('data-rules-preview-active')).toBe('true')
    const firstPreview = screen.getByRole('dialog', { name: 'First preview' })

    fireEvent.mouseMove(screen.getByRole('button', { name: 'Second' }))
    expect(screen.queryByRole('dialog', { name: 'Second preview' })).toBeNull()
    const secondPreview = await screen.findByRole('dialog', { name: 'Second preview' })
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'First preview' })).toBe(firstPreview)
    expect(secondPreview.textContent).toContain('Second points to Third.')

    fireEvent.mouseMove(within(secondPreview).getByRole('button', { name: 'Third' }))
    const thirdPreview = await screen.findByRole('dialog', { name: 'Third preview' })
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(screen.queryByRole('dialog', { name: 'First preview' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Second preview' })).toBe(secondPreview)
    expect(thirdPreview).toBe(firstPreview)
  })

  test('keeps one global pin with a bounded two-level transient chain', async () => {
    const recursiveLookup = buildRecursiveLookup({
      conditions: [
        { name: 'First', source: 'PHB', entries: ['See {@condition Second|PHB}.'] },
        { name: 'Second', source: 'PHB', entries: ['See {@condition Fourth|PHB}.'] },
        { name: 'Third', source: 'PHB', entries: ['Third details.'] },
        { name: 'Fourth', source: 'PHB', entries: ['Fourth details.'] },
      ],
    })

    renderWithManager(
      <>
        <RenderedEntryWithTooltip
          entry="Start with {@condition First|PHB}."
          recursiveLookup={recursiveLookup}
        />
        <RenderedEntryWithTooltip
          entry="Or inspect {@condition Third|PHB}."
          recursiveLookup={recursiveLookup}
        />
      </>,
    )

    fireEvent.mouseMove(screen.getByRole('button', { name: 'First' }))
    const firstPreview = screen.getByRole('dialog', { name: 'First preview' })
    fireEvent.click(within(firstPreview).getByTitle('Pin tooltip'))

    const pinnedFirst = screen.getByRole('dialog', { name: 'First preview' })
    expect(within(pinnedFirst).getByTitle('Unpin tooltip')).toBeTruthy()

    fireEvent.mouseMove(screen.getByRole('button', { name: 'Third' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'First preview' })).toBeTruthy()
    const thirdPreview = screen.getByRole('dialog', { name: 'Third preview' })
    expect(within(thirdPreview).getByTitle('Pin tooltip')).toBeTruthy()

    fireEvent.mouseMove(screen.getByRole('button', { name: 'Second' }))
    await screen.findByRole('dialog', { name: 'Second preview' })
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(screen.queryByRole('dialog', { name: 'Third preview' })).toBeNull()
    const secondPreview = screen.getByRole('dialog', { name: 'Second preview' })

    fireEvent.mouseMove(within(secondPreview).getByRole('button', { name: 'Fourth' }))
    await screen.findByRole('dialog', { name: 'Fourth preview' })
    expect(screen.getAllByRole('dialog')).toHaveLength(3)
    expect(screen.getByRole('dialog', { name: 'First preview' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Second preview' })).toBe(secondPreview)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Fourth preview' })).toBeNull()
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    fireEvent.click(within(secondPreview).getByTitle('Pin tooltip'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('dialog', { name: 'First preview' })).toBeNull()
    expect(
      within(screen.getByRole('dialog', { name: 'Second preview' })).getByTitle('Unpin tooltip'),
    ).toBeTruthy()
  })

  test('keeps a pinned snapshot after its virtualized source unmounts', () => {
    const recursiveLookup = buildRecursiveLookup({
      conditions: [{ name: 'Prone', source: 'PHB', entries: ['Persistent details.'] }],
    })
    const view = renderWithManager(
      <RenderedEntryWithTooltip
        entry="Read {@condition Prone|PHB}."
        recursiveLookup={recursiveLookup}
      />,
    )

    fireEvent.mouseMove(screen.getByRole('button', { name: 'Prone' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByTitle('Pin tooltip'))
    view.rerender(<RulesPreviewManager>{null}</RulesPreviewManager>)

    expect(screen.getByRole('dialog', { name: 'Prone preview' }).textContent).toContain(
      'Persistent details.',
    )
  })

  test('dismisses an unpinned transfer when the pointer next moves outside the chain', async () => {
    renderWithManager(
      <RenderedEntryWithTooltip
        entry="Read {@condition Prone|PHB}."
        recursiveLookup={buildRecursiveLookup({
          conditions: [{ name: 'Prone', source: 'PHB', entries: ['Details.'] }],
        })}
      />,
    )

    fireEvent.mouseMove(screen.getByRole('button', { name: 'Prone' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByTitle('Pin tooltip'))
    fireEvent.click(screen.getByTitle('Unpin tooltip'))
    fireEvent.mouseMove(document.body)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('opens from the keyboard, pins on activation, and closes in layers with Escape', async () => {
    const user = userEvent.setup()
    const recursiveLookup = buildRecursiveLookup({
      conditions: [
        { name: 'First', source: 'PHB', entries: ['See {@condition Second|PHB}.'] },
        { name: 'Second', source: 'PHB', entries: ['Second details.'] },
      ],
    })
    renderWithManager(
      <RenderedEntryWithTooltip
        entry="Read {@condition First|PHB}."
        recursiveLookup={recursiveLookup}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'First' })
    await user.tab()
    expect(document.activeElement).toBe(trigger)
    expect(screen.getByRole('dialog', { name: 'First preview' })).toBeTruthy()

    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByTitle('Unpin tooltip'))
    fireEvent.mouseMove(screen.getByRole('button', { name: 'Second' }))
    await screen.findByRole('dialog', { name: 'Second preview' })
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Second preview' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'First preview' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  test('uses the same manager for spell-name previews and their references', async () => {
    const spell = {
      name: 'Root Spell',
      source: 'PHB',
      level: 1,
      school: 'E',
      time: [],
      duration: [],
      components: {},
      range: { type: 'special' },
      entries: ['The spell causes the {@condition Prone|PHB} condition.'],
    } as Spell5e
    const recursiveLookup = buildRecursiveLookup({
      spells: [spell],
      conditions: [{ name: 'Prone', source: 'PHB', entries: ['Prone details.'] }],
    })

    renderWithManager(
      <SpellNameTooltip name={spell.name} spell={spell} recursiveLookup={recursiveLookup} />,
    )
    fireEvent.mouseEnter(screen.getByText('Root Spell'))
    expect(screen.getByRole('dialog', { name: 'Root Spell preview' })).toBeTruthy()

    fireEvent.mouseMove(screen.getByRole('button', { name: 'Prone' }))
    await screen.findByRole('dialog', { name: 'Prone preview' })
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Root Spell preview' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Prone preview' }).textContent).toContain(
      'Prone details.',
    )
  })

  test('renders canonical spell casing instead of a lowercase stored reference', () => {
    const spell = {
      name: "Melf's Acid Arrow",
      source: 'PHB',
      level: 2,
      school: 'E',
      time: [],
      range: { type: 'special' },
      duration: [],
      entries: [],
    } as Spell5e

    renderWithManager(
      <SpellNameTooltip
        name="melf's acid arrow"
        spell={spell}
        recursiveLookup={buildRecursiveLookup({ spells: [spell] })}
      />,
    )

    expect(screen.getByText("Melf's Acid Arrow")).toBeTruthy()
    expect(screen.queryByText("melf's acid arrow")).toBeNull()
  })
})
