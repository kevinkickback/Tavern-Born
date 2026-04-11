import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { RaceStep } from '@/components/character/wizard/steps/3-RaceStep'
import type { Race5e } from '@/types/5etools'

vi.mock('@/components/character/TraitTooltip', () => ({
  TraitTooltip: ({ children }: { children: React.ReactNode }) => children,
}))

describe('RaceStep', () => {
  afterEach(() => {
    cleanup()
  })

  test('defaults to the first available subrace when none is selected', async () => {
    const onChange = vi.fn()
    const races: Race5e[] = [
      {
        name: 'Human',
        source: 'PHB',
        entries: ['Short generic race text.'],
        fluffEntries: [
          'Humans are diverse and ambitious, thriving in nearly every land and culture.',
        ],
        subraces: [
          { name: 'Default', source: 'PHB' } as Race5e,
          { name: 'Variant', source: 'PHB' } as Race5e,
        ],
      } as Race5e,
    ]

    render(
      <RaceStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          race: 'Human',
          raceSource: 'PHB',
        }}
        onChange={onChange}
        races={races}
      />,
    )

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        subrace: 'Default',
        subraceSource: 'PHB',
      })
    })

    expect(document.body.textContent?.includes('diverse and ambitious')).toBe(true)
  })

  test('keeps parent race traits visible when the default subrace is selected', () => {
    const races: Race5e[] = [
      {
        name: 'Human',
        source: 'PHB',
        entries: [
          {
            type: 'entries',
            name: 'Versatile',
            entries: ['Humans are broadly capable.'],
          },
        ],
        subraces: [{ name: 'Default', source: 'PHB' } as Race5e],
      } as Race5e,
    ]

    const { getByText } = render(
      <RaceStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          race: 'Human',
          raceSource: 'PHB',
          subrace: 'Default',
          subraceSource: 'PHB',
        }}
        onChange={vi.fn()}
        races={races}
      />,
    )

    expect(getByText('Versatile')).toBeTruthy()
  })

  test('suppresses older race reprints when preferNewerPrintings is enabled', () => {
    const races: Race5e[] = [
      {
        name: 'Aasimar',
        source: 'MPMM',
        reprintedAs: ['Aasimar|XPHB'],
      } as Race5e,
      {
        name: 'Aasimar',
        source: 'XPHB',
      } as Race5e,
    ]

    const { getAllByText, queryByText } = render(
      <RaceStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          race: 'Aasimar',
          raceSource: 'XPHB',
          allowedSources: ['XPHB', 'MPMM'],
          variantRules: {
            ...INITIAL_CHARACTER_DATA.variantRules,
            preferNewerPrintings: true,
          },
        }}
        onChange={vi.fn()}
        races={races}
      />,
    )

    expect(getAllByText('Aasimar').length).toBeGreaterThan(0)
    expect(getAllByText('XPHB').length).toBeGreaterThan(0)
    expect(queryByText('MPMM')).toBeNull()
  })
})
