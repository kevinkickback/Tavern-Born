import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
    const loadCatalog = vi.fn(() => {
      useGameDataStore.setState({ error: 'Local directory is unavailable' })
      return Promise.resolve({
        kind: 'rejected' as const,
        message: 'Local directory is unavailable',
      })
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
      pendingCatalog: null,
      cacheStatus: 'cached',
      loadCatalog,
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

    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Couldn’t check your additional content', {
        description: 'Local directory is unavailable',
      }),
    )
    expect(toast.info).not.toHaveBeenCalledWith('Game data is up to date')
  })

  test.each([
    'updated',
    'unchanged',
    'failed',
  ])('shows progress and restores the button when the check %s', async (outcome) => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    const result = new Promise<void>((resolve) => {
      finish = resolve
    })
    const loadCatalog = vi.fn(async () => {
      useGameDataStore.setState({ isBackgroundRefreshing: true })
      await result
      useGameDataStore.setState({
        isBackgroundRefreshing: false,
        error: outcome === 'failed' ? 'Local directory is unavailable' : null,
      })
      if (outcome === 'failed')
        return { kind: 'rejected' as const, message: 'Local directory is unavailable' }
      return outcome === 'updated'
        ? { kind: 'staged' as const }
        : { kind: 'applied' as const, changed: false }
    })
    useGameDataStore.setState({ loadCatalog })
    render(<DataSourceConfigurator />)

    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))
    const checking = screen.getByRole('button', {
      name: 'Checking for updates…',
    }) as HTMLButtonElement
    expect(checking.disabled).toBe(true)
    expect(checking.querySelector('svg')?.getAttribute('class')).toContain(
      'motion-safe:animate-spin',
    )
    await user.click(checking)
    expect(loadCatalog).toHaveBeenCalledTimes(1)
    await act(finish)
    expect(screen.getByRole('button', { name: 'Check for Updates' }).hasAttribute('disabled')).toBe(
      false,
    )
    if (outcome === 'updated') expect(toast.info).toHaveBeenCalledWith('Game data ready for review')
    if (outcome === 'unchanged') expect(toast.info).toHaveBeenCalledWith('Game data is up to date')
    if (outcome === 'failed')
      expect(toast.error).toHaveBeenCalledWith('Couldn’t check your additional content', {
        description: 'Local directory is unavailable',
      })
  })

  test('shows external source details without exposing the internal base layer', () => {
    render(<DataSourceConfigurator />)

    expect(screen.getByText('Additional Content on This Computer')).toBeTruthy()
    expect(screen.getByText('C:/5etools/data')).toBeTruthy()
    expect(screen.queryByText('Base content:')).toBeNull()
  })

  test('offers a reload after manually checking a matching rebuild', async () => {
    const user = userEvent.setup()
    const state = useGameDataStore.getState()
    const config = state.dataSourceConfig!
    const data = state.gameData!
    useGameDataStore.setState({
      loadCatalog: () => {
        useGameDataStore.setState({
          pendingCatalog: {
            candidate: {
              config: { ...config, type: 'local' },
              identity: config,
              data,
              keys: [],
              warnings: [],
            },
            reason: 'reload',
            removals: [],
            incompleteRemovalPreview: true,
          },
        })
        return Promise.resolve({ kind: 'staged' })
      },
    })
    render(<DataSourceConfigurator />)

    await user.click(screen.getByRole('button', { name: 'Check for Updates' }))

    expect(toast.info).toHaveBeenCalledWith('Additional content ready to restore')
    expect(screen.getByRole('button', { name: 'Restore additional content' })).toBeTruthy()
  })

  test('keeps the startup update preference on the main Game Data view', async () => {
    const user = userEvent.setup()
    render(<DataSourceConfigurator />)

    expect(screen.getByText('Automatic update checks')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Change Additional Content' }))

    expect(screen.queryByText('Automatic update checks')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Automatic update checks')).toBeTruthy()
  })

  test('removes additional content without clearing the current source first', async () => {
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

    expect(screen.queryByRole('button', { name: 'Remove Additional Content' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Change Additional Content' }))
    const revertButton = screen.getByRole('button', { name: 'Remove Additional Content' })
    expect(revertButton.className).toContain('border-warning')
    await user.click(revertButton)

    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation.textContent).toContain('removes the saved connection')
    expect(confirmation.textContent).toContain('your characters will remain')
    expect(restoreBundledData).not.toHaveBeenCalled()
    await user.click(
      within(confirmation).getByRole('button', { name: 'Remove Additional Content' }),
    )

    await waitFor(() => {
      expect(restoreBundledData).toHaveBeenCalledTimes(1)
      expect(toast.success).toHaveBeenCalledWith('Additional content removed', {
        description: 'The included 2014 and 2024 SRD rules remain ready to use.',
      })
      expect(onSourceLoaded).toHaveBeenCalledTimes(1)
    })
  })

  test('shows useful included SRD details without redundant status or rebuild controls', async () => {
    vi.stubGlobal('electronAPI', {
      getBundledManifest: vi.fn(async () => ({
        schemaVersion: 1,
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        distributionStatus: 'approved-for-distribution',
        documents: [
          {
            version: '5.1',
            landingPage: 'https://example.com/srd-5.1',
            downloadUrl: 'https://example.com/srd-5.1.pdf',
            attribution: 'SRD 5.1 attribution',
          },
          {
            version: '5.2.1',
            landingPage: 'https://example.com/srd-5.2.1',
            downloadUrl: 'https://example.com/srd-5.2.1.pdf',
            attribution: 'SRD 5.2.1 attribution',
          },
        ],
        license: {
          name: 'Creative Commons Attribution 4.0 International',
          identifier: 'CC-BY-4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        },
        transformationNotice: 'Internal transformation note',
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

    expect(screen.getByText('Included SRD Rules')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('SRD 5.1 and SRD 5.2.1')).toBeTruthy())
    expect(screen.getByText('2014 and 2024')).toBeTruthy()
    expect(screen.getByText('Not required')).toBeTruthy()
    expect(screen.queryByText('1.0.0')).toBeNull()
    expect(screen.queryByText('Content updated:')).toBeNull()
    expect(screen.queryByText('Status:')).toBeNull()
    expect(screen.queryByText('Ready to use:')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add Additional Content' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use Included SRD' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check for Updates' })).toBeNull()
    expect(screen.queryByText('Automatic update checks')).toBeNull()
  })

  test('recovery shows source selection without an SRD choice prompt', () => {
    useGameDataStore.setState({ gameData: null })
    render(<DataSourceConfigurator selectorOnly />)
    expect(screen.getByRole('heading', { name: 'Choose Game Data' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use Included SRD' })).toBeNull()
  })

  test('places first-run source guidance beside the selector controls', () => {
    useGameDataStore.setState({
      dataSourceConfig: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
    })

    render(<DataSourceConfigurator selectorOnly showAdditionalContentGuidance />)

    expect(screen.getByText('Choose a Source')).toBeTruthy()
    expect(screen.getByText(/Select 5etools compatible JSON data/)).toBeTruthy()
    expect(screen.getByText(/Not sure where to begin/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '5etools community wiki' }).getAttribute('href')).toBe(
      'https://wiki.tercept.net/en/5eTools/InstallGuide#step-1-downloading-the-site',
    )
  })
})
