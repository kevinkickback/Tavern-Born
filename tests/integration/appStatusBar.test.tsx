import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppStatusBar } from '@/components/layout/AppStatusBar'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('application status bar', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
    useGameDataStore.setState({
      cacheStatus: 'fresh',
      dataSourceConfig: { type: 'local', path: 'C:\\game-data', isValid: true },
      isLoading: false,
      isBackgroundRefreshing: false,
      loadProgress: null,
      error: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('shows durable data-source state', () => {
    render(<AppStatusBar />)

    expect(screen.getByTestId('game-data-status').textContent).toContain('Game data ready')
    expect(screen.getByText('Local source')).toBeTruthy()
  })

  test('shows loading progress and the current resource', () => {
    useGameDataStore.setState({
      isLoading: true,
      loadProgress: { current: 3, total: 12, resource: 'spells.json' },
    })

    render(<AppStatusBar />)

    const status = screen.getByTestId('game-data-status')
    expect(status.textContent).toContain('Loading game data 3/12')
    expect(status.getAttribute('title')).toBe('spells.json')
  })

  test('shows active-character save state', () => {
    const character = makeCharacterFixture({ name: 'Aelar' })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<AppStatusBar />)

    expect(screen.getByTestId('character-save-status').textContent).toBe('Character saved')
  })
})
