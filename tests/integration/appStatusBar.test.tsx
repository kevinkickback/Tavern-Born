import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppStatusBar } from '@/components/layout/AppStatusBar'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

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
    expect(screen.getByText('External local source')).toBeTruthy()
  })

  test('identifies the bundled SRD pack without exposing a filesystem path', () => {
    useGameDataStore.setState({
      cacheStatus: 'fetched',
      dataSourceConfig: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
    })

    render(<AppStatusBar />)

    const source = screen.getByText('Bundled SRD')
    expect(source.getAttribute('title')).toBe('tavern-born-srd-core 1.0.0')
    expect(screen.getByTestId('game-data-status').getAttribute('title')).toBe(
      'Bundled SRD 1.0.0 loaded successfully',
    )
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
