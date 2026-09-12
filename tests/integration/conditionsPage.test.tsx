import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ConditionsPage } from '@/pages/details/ConditionsPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/hooks/character/useHitPoints', () => ({
  useHitPoints: () => ({ hitDie: 8 }),
}))

vi.mock('@/hooks/character/useRitualCasting', () => ({
  useRitualCasting: () => false,
}))

vi.mock('@/hooks/character/useClassResources', () => ({
  useClassResources: () => ({
    resources: [],
    updateCurrent: vi.fn(),
    resetResource: vi.fn(),
    resetAll: vi.fn(),
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useConditions: () => [
    {
      name: 'Blinded',
      source: 'PHB',
      _sourceType: 'condition',
      entries: ['Sight-dependent checks fail while {@condition Prone|PHB}.'],
    },
    {
      name: 'Poisoned',
      source: 'PHB',
      _sourceType: 'condition',
      entries: ['Has disadvantage on attack rolls and ability checks.'],
    },
    {
      name: 'Prone',
      source: 'PHB',
      _sourceType: 'condition',
      entries: ['Must crawl or stand before moving normally.'],
    },
    {
      name: 'Exhaustion',
      source: 'PHB',
      page: 291,
      _sourceType: 'condition',
      entries: [
        'Exhaustion effects are cumulative.',
        {
          type: 'table',
          rows: [
            ['1', 'Disadvantage on ability checks'],
            ['2', 'Speed halved'],
            ['3', 'Disadvantage on attacks and saves'],
            ['4', 'Hit point maximum halved'],
            ['5', 'Speed reduced to 0'],
            ['6', 'Death'],
          ],
        },
      ],
    },
    {
      name: 'Exhaustion',
      source: 'XPHB',
      page: 365,
      _sourceType: 'condition',
      entries: ['The roll is reduced by 2 times your Exhaustion level.'],
    },
  ],
}))

function renderPage(initialEntry = '/details/conditions') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ConditionsPage />
    </MemoryRouter>,
  )
}

describe('ConditionsPage', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      originSystem: '2014',
      conditions: ['Poisoned'],
      exhaustion: 2,
    })
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

  test('uses a functional header to show one tracker at a time', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole('tablist', { name: 'Condition category' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Combat State' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByRole('heading', { name: 'Combat State' })).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Exhaustion' }))

    expect(screen.getAllByRole('button', { name: /Set exhaustion level/ })).toHaveLength(7)
    expect(
      screen.getByRole('button', { name: 'Set exhaustion level 2' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText('Disadvantage on ability checks')).toBeTruthy()
    expect(screen.getByText('Speed reduced to 0')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Set exhaustion level 4' }))
    expect(useCharacterStore.getState().activeCharacter?.exhaustion).toBe(4)
  })

  test('renders tooltip-aware condition rules and toggles from the whole card', async () => {
    const user = userEvent.setup()
    const { container } = renderPage('/details/conditions?section=conditions')

    expect(screen.getByText('1 active')).toBeTruthy()
    expect(screen.getByText('Has disadvantage on attack rolls and ability checks.')).toBeTruthy()
    expect(
      (screen.getByRole('checkbox', { name: 'Poisoned condition' }) as HTMLInputElement).checked,
    ).toBe(true)

    await user.click(screen.getByText(/Sight-dependent checks fail while/))

    expect(useCharacterStore.getState().activeCharacter?.conditions).toEqual([
      'Poisoned',
      'Blinded',
    ])

    const tooltipTrigger = container.querySelector(
      '[data-condition-card="Blinded"] [data-recursive-title]',
    )
    expect(tooltipTrigger).toBeTruthy()
    fireEvent.mouseMove(tooltipTrigger as Element)
    expect(screen.getByRole('dialog')).toBeTruthy()

    await user.click(tooltipTrigger as Element)
    expect(useCharacterStore.getState().activeCharacter?.conditions).toEqual([
      'Poisoned',
      'Blinded',
    ])
  })

  test('shows revised exhaustion effects for 2024 characters', () => {
    const character = makeCharacterFixture({ originSystem: '2024', exhaustion: 3 })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage('/details/conditions?section=exhaustion')

    expect(screen.getByText('The roll is reduced by 2 times your Exhaustion level.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Set exhaustion level 3' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
