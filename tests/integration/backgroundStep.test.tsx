import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { BackgroundStep } from '@/components/character/wizard/steps/5-BackgroundStep'
import type { Background5e } from '@/types/5etools'

describe('BackgroundStep', () => {
  afterEach(() => {
    cleanup()
  })

  test('defaults to the first available background when none is selected', async () => {
    const onChange = vi.fn()
    const backgrounds: Background5e[] = [
      {
        name: 'Acolyte',
        source: 'PHB',
        entries: ['You have spent your life in service to a temple.'],
      } as Background5e,
      {
        name: 'Charlatan',
        source: 'PHB',
        entries: ['You have always had a way with lies.'],
      } as Background5e,
    ]

    render(
      <BackgroundStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          background: '',
          backgroundSource: '',
        }}
        onChange={onChange}
        backgrounds={backgrounds}
      />,
    )

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        background: 'Acolyte',
        backgroundSource: 'PHB',
      })
    })
  })

  test('selecting a background updates background and source', () => {
    const onChange = vi.fn()
    const backgrounds: Background5e[] = [
      { name: 'Acolyte', source: 'PHB', entries: ['Acolyte description.'] } as Background5e,
      { name: 'Sage', source: 'PHB', entries: ['Sage description.'] } as Background5e,
    ]

    const { getByRole } = render(
      <BackgroundStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          background: 'Acolyte',
          backgroundSource: 'PHB',
        }}
        onChange={onChange}
        backgrounds={backgrounds}
      />,
    )

    fireEvent.click(getByRole('button', { name: /sage/i }))

    expect(onChange).toHaveBeenCalledWith({
      background: 'Sage',
      backgroundSource: 'PHB',
    })
  })

  test('uses non-feature text for Background Overview', () => {
    const backgrounds: Background5e[] = [
      {
        name: 'Sage',
        source: 'PHB',
        entries: [
          'You spent years learning the lore of the multiverse.',
          {
            type: 'entries',
            name: 'Feature: Researcher',
            entries: ['When you attempt to learn lore, you usually know where to find it.'],
          },
        ],
      } as Background5e,
    ]

    const { getByText } = render(
      <BackgroundStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          background: 'Sage',
          backgroundSource: 'PHB',
        }}
        onChange={vi.fn()}
        backgrounds={backgrounds}
      />,
    )

    expect(getByText(/spent years learning the lore/i)).toBeTruthy()
    expect(getByText(/attempt to learn lore/i)).toBeTruthy()
  })
})
