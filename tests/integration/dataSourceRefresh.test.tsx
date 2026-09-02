import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
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
})
