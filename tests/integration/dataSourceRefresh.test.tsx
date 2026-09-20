import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'

const defaultRestoreBundledData = useGameDataStore.getState().restoreBundledData

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

describe('data source refresh feedback', () => {
  beforeEach(() => {
    const loadGameData = vi.fn(() => {
      useGameDataStore.setState({ error: 'Local directory is unavailable' })
      return Promise.resolve(false)
    })

    useGameDataStore.setState({
      gameData: {} as GameData,
      dataSourceConfig: {
        type: 'local',
        path: 'C:/5etools/data',
        isValid: true,
      },
      isLoading: false,
      isBackgroundRefreshing: false,
      loadProgress: null,
      error: null,
      lastDataChangedAt: '2026-01-01T00:00:00.000Z',
      lastUpdateCheckAt: '2026-01-01T00:00:00.000Z',
      cacheStatus: 'fresh',
      loadGameData,
      restoreBundledData: defaultRestoreBundledData,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('reports a local-directory refresh failure instead of saying data is current', async () => {
    const user = userEvent.setup()
    render(<DataSourceConfigurator />)

    await user.click(screen.getByRole('button', { name: 'Update Data' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to check for updates', {
        description: 'Local directory is unavailable',
      }),
    )
    expect(toast.info).not.toHaveBeenCalledWith('Data is already up to date')
  })

  test('restores bundled SRD data without clearing the current source first', async () => {
    const user = userEvent.setup()
    const restoreBundledData = vi.fn(() => {
      useGameDataStore.setState({
        dataSourceConfig: {
          type: 'bundled',
          path: 'srd/core',
          packId: 'tavern-born-srd-core',
          packVersion: '1.0.0',
          isValid: true,
        },
        error: null,
      })
      return Promise.resolve(true)
    })
    useGameDataStore.setState({ restoreBundledData })
    render(<DataSourceConfigurator />)

    await user.click(screen.getByRole('button', { name: 'Restore Bundled SRD' }))

    expect(restoreBundledData).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Bundled SRD data restored', {
      description: 'SRD 5.1 and 5.2.1 rules are ready to use.',
    })
  })

  test('shows bundled pack identity and rebuild controls for the active bundled source', () => {
    useGameDataStore.setState({
      dataSourceConfig: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
    })

    render(<DataSourceConfigurator />)

    expect(screen.getByText('Bundled SRD 5.1 + 5.2.1')).toBeTruthy()
    expect(screen.getByText('1.0.0')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rebuild Bundled SRD' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Update Data' })).toBeNull()
    expect(screen.queryByText('Auto-refresh on Launch')).toBeNull()
  })

  test('offers bundled SRD as a fallback when no external source produced usable data', async () => {
    const user = userEvent.setup()
    const restoreBundledData = vi.fn(() => {
      useGameDataStore.setState({ error: 'Bundled pack is unavailable' })
      return Promise.resolve(false)
    })
    useGameDataStore.setState({
      gameData: null,
      dataSourceConfig: {
        type: 'remote',
        path: 'https://example.com/unavailable',
        isValid: true,
      },
      restoreBundledData,
    })
    render(<DataSourceConfigurator selectorOnly />)

    await user.click(screen.getByRole('button', { name: 'Use Bundled SRD' }))

    expect(restoreBundledData).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Unable to load bundled SRD data', {
      description: 'Bundled pack is unavailable',
    })
  })
})
