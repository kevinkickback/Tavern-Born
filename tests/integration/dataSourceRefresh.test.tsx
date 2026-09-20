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
    vi.unstubAllGlobals()
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
    const onSourceLoaded = vi.fn()
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
    render(<DataSourceConfigurator onSourceLoaded={onSourceLoaded} />)

    await user.click(screen.getByRole('button', { name: 'Restore Bundled SRD' }))

    expect(restoreBundledData).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Bundled SRD data restored', {
      description: 'SRD 5.1 and 5.2.1 rules are ready to use.',
    })
    expect(onSourceLoaded).toHaveBeenCalledTimes(1)
  })

  test('shows bundled pack identity, validation, license, and rebuild controls', async () => {
    vi.stubGlobal('electronAPI', {
      getBundledManifest: vi.fn(async () => ({
        schemaVersion: 1,
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        distributionStatus: 'approved-for-distribution',
        documents: [
          {
            version: '5.1',
            landingPage: 'https://example.com/srd',
            downloadUrl: 'https://example.com/srd-5.1.pdf',
            attribution: 'Official test attribution.',
          },
        ],
        license: {
          name: 'Creative Commons Attribution 4.0 International',
          identifier: 'CC-BY-4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        },
        transformationNotice: 'Test transformation notice.',
      })),
    })
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
    expect(screen.getByText('Validated')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('link', { name: 'CC-BY-4.0' })).toBeTruthy())
    expect(screen.getByText('Test transformation notice.')).toBeTruthy()
    expect(screen.getByText('Official test attribution.')).toBeTruthy()
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

  test('offers the bundled SRD from Settings when no source is active', () => {
    useGameDataStore.setState({
      gameData: null,
      dataSourceConfig: null,
    })

    render(<DataSourceConfigurator />)

    expect(screen.getByRole('button', { name: 'Use Bundled SRD' })).toBeTruthy()
    expect(screen.getByText(/Use the included bundled SRD/)).toBeTruthy()
  })
})
