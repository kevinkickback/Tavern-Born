import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CompendiumPage } from '@/pages/compendium/CompendiumPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

const gameData = {
  classes: [
    { name: 'Legacy Fighter', source: 'PHB', fluffEntries: ['Legacy class'] },
    {
      name: 'Revised Fighter',
      source: 'XPHB',
      edition: 'one',
      fluffEntries: ['Revised class'],
    },
  ],
  sources: [
    { abbreviation: 'PHB', name: "Player's Handbook", group: 'core' },
    { abbreviation: 'XPHB', name: "Player's Handbook (2024)", group: 'core' },
  ],
} as GameData

function renderPage() {
  return render(
    <MemoryRouter>
      <CompendiumPage />
    </MemoryRouter>,
  )
}

describe('CompendiumPage edition filtering', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
    useGameDataStore.setState({ gameData })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('defaults to Both without a character and filters when an edition is selected', () => {
    renderPage()

    expect(screen.getByRole('radio', { name: 'Both editions' }).getAttribute('data-state')).toBe(
      'on',
    )
    expect(screen.getByText('Legacy Fighter')).toBeTruthy()
    expect(screen.getByText('Revised Fighter')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: '5e edition' }))
    expect(screen.getByText('Legacy Fighter')).toBeTruthy()
    expect(screen.queryByText('Revised Fighter')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: '5.5e edition' }))
    expect(screen.queryByText('Legacy Fighter')).toBeNull()
    expect(screen.getByText('Revised Fighter')).toBeTruthy()
  })

  test('remains global when the active character restricts ruleset and sources', () => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['PHB'],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage()

    expect(screen.getByRole('radio', { name: 'Both editions' }).getAttribute('data-state')).toBe(
      'on',
    )
    expect(screen.getByText('Legacy Fighter')).toBeTruthy()
    expect(screen.getByText('Revised Fighter')).toBeTruthy()
  })
})
