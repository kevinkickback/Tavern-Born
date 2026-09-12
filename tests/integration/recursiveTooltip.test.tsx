import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildRecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { SpellNameTooltip } from '@/pages/spells/components/SpellNameTooltip'
import type { Spell5e } from '@/types/5etools'

describe('RenderedEntryWithTooltip', () => {
  afterEach(cleanup)

  test('opens references recursively and keeps every parent tooltip available', () => {
    const recursiveLookup = buildRecursiveLookup({
      conditions: [
        {
          name: 'First',
          source: 'PHB',
          entries: ['First points to {@condition Second|PHB}.'],
        },
        {
          name: 'Second',
          source: 'PHB',
          entries: ['Second points to {@condition Third|PHB}.'],
        },
        {
          name: 'Third',
          source: 'PHB',
          entries: ['Third-level tooltip content.'],
        },
      ],
    })

    render(
      <RenderedEntryWithTooltip
        entry="Start with {@condition First|PHB}."
        recursiveLookup={recursiveLookup}
      />,
    )

    const firstTrigger = screen.getByText('First')
    fireEvent.mouseMove(firstTrigger)
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
    expect(screen.getByRole('tooltip').textContent).toContain('First points to Second.')
    expect(firstTrigger.getAttribute('data-recursive-preview-active')).toBe('true')

    const secondTrigger = document.querySelector('[data-hover-name="Second"]') as Element
    fireEvent.mouseMove(secondTrigger)
    expect(screen.getAllByRole('tooltip')).toHaveLength(2)
    expect(screen.getAllByRole('tooltip')[1]?.textContent).toContain('Second points to Third.')
    expect(secondTrigger.getAttribute('data-recursive-preview-active')).toBe('true')

    fireEvent.mouseMove(document.querySelector('[data-recursive-tooltip-depth="0"]') as Element)
    const childTooltip = document.querySelector('[data-recursive-tooltip-depth="1"]')
    expect(childTooltip).toBeTruthy()
    expect(childTooltip?.className).toContain('bg-card')
    expect(childTooltip?.className).toContain('ring-2')

    const thirdTrigger = document.querySelector('[data-hover-name="Third"]') as Element
    fireEvent.mouseMove(thirdTrigger)
    expect(screen.getAllByRole('tooltip')).toHaveLength(3)
    expect(screen.getAllByRole('tooltip')[2]?.textContent).toContain('Third-level tooltip content.')
    expect(childTooltip?.className).toContain('shadow-md')
    expect(childTooltip?.className).not.toContain('ring-2')
    expect(document.querySelector('[data-recursive-tooltip-depth="2"]')?.className).toContain(
      'ring-2',
    )
    expect(thirdTrigger.getAttribute('data-recursive-preview-active')).toBe('true')
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(screen.getByText('3 of 3')).toBeTruthy()

    fireEvent.click(screen.getByTitle('Close tooltip'))
    expect(firstTrigger.hasAttribute('data-recursive-preview-active')).toBe(false)
    expect(secondTrigger.hasAttribute('data-recursive-preview-active')).toBe(false)
    expect(thirdTrigger.hasAttribute('data-recursive-preview-active')).toBe(false)
  })

  test('continues recursively from a spell-name tooltip', async () => {
    const user = userEvent.setup()
    const spell = {
      name: 'Root Spell',
      source: 'PHB',
      level: 1,
      school: 'E',
      time: [],
      duration: [],
      components: {},
      range: { type: 'special' },
      entries: ['The spell causes the {@condition First|PHB} condition.'],
    } as Spell5e
    const recursiveLookup = buildRecursiveLookup({
      spells: [spell],
      conditions: [
        {
          name: 'First',
          source: 'PHB',
          entries: ['First points to {@condition Second|PHB}.'],
        },
        {
          name: 'Second',
          source: 'PHB',
          entries: ['Second-level tooltip content.'],
        },
      ],
    })

    render(
      <TooltipProvider>
        <SpellNameTooltip name={spell.name} spell={spell} recursiveLookup={recursiveLookup} />
      </TooltipProvider>,
    )

    await user.hover(screen.getByText('Root Spell'))
    expect(await screen.findByRole('tooltip')).toBeTruthy()

    fireEvent.mouseMove(document.querySelector('[data-hover-name="First"]') as Element)
    expect(document.querySelector('[data-recursive-tooltip-depth="1"]')).toBeTruthy()

    fireEvent.mouseMove(document.querySelector('[data-recursive-tooltip-depth="0"]') as Element)
    expect(document.querySelector('[data-recursive-tooltip-depth="1"]')).toBeTruthy()

    fireEvent.mouseMove(document.querySelector('[data-hover-name="Second"]') as Element)
    expect(document.querySelector('[data-recursive-tooltip-depth="2"]')?.textContent).toContain(
      'Second-level tooltip content.',
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

    render(
      <TooltipProvider>
        <SpellNameTooltip
          name="melf's acid arrow"
          spell={spell}
          recursiveLookup={buildRecursiveLookup({ spells: [spell] })}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText("Melf's Acid Arrow")).toBeTruthy()
    expect(screen.queryByText("melf's acid arrow")).toBeNull()
  })
})
