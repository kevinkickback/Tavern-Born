import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppLayout } from '@/components/layout/AppLayout'
import { AppStatusBar } from '@/components/layout/AppStatusBar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsPage } from '@/pages/SettingsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

describe('application status bar', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
    useGameDataStore.setState({
      cacheStatus: 'cached',
      gameData: makeGameDataFixture(),
      sessionBundledSource: null,
      pendingCatalog: null,
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
    vi.unstubAllGlobals()
  })

  test.each(['local', 'remote'] as const)('labels %s content in the same status slot', (type) => {
    useGameDataStore.setState({
      dataSourceConfig: { type, path: 'example', isValid: true },
    })

    render(<AppStatusBar />)

    expect(screen.getByTestId('game-data-status').textContent).toBe('Additional Content Loaded')
  })

  test('uses the catalog slot for update checks and restores it after success or failure', async () => {
    render(<AppStatusBar />)
    const status = screen.getByTestId('game-data-status')

    await act(() => useGameDataStore.setState({ isBackgroundRefreshing: true }))
    expect(status.textContent).toBe('Checking for game data updates')
    expect(status.querySelector('svg')?.classList.contains('animate-spin')).toBe(true)
    expect(screen.queryByText('Additional Content Loaded')).toBeNull()

    await act(() =>
      useGameDataStore.setState({ isBackgroundRefreshing: false, cacheStatus: 'fetched' }),
    )
    expect(status.textContent).toBe('Additional Content Loaded')

    await act(() => useGameDataStore.setState({ isBackgroundRefreshing: true }))
    await act(() =>
      useGameDataStore.setState({
        isBackgroundRefreshing: false,
        cacheStatus: 'remote-cache',
        error: 'Source is offline',
      }),
    )
    expect(status.textContent).toBe('Additional Content Loaded')
    expect(status.getAttribute('title')).toBe('Source is offline')
    expect(status.querySelector('svg')?.classList.contains('animate-spin')).toBe(false)
  })

  test.each([false, true])('labels the bundled catalog when the fallback is %s', (fallback) => {
    const bundled = {
      type: 'bundled' as const,
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    }
    useGameDataStore.setState(
      fallback
        ? { cacheStatus: 'session-srd', sessionBundledSource: bundled }
        : { cacheStatus: 'fetched', dataSourceConfig: bundled },
    )

    render(<AppStatusBar />)

    const status = screen.getByTestId('game-data-status')
    const label = fallback ? 'Built-in rules only' : 'SRD Content Only'
    expect(status.textContent).toBe(label)
    expect(screen.getByText(label).classList.contains('text-muted-foreground')).toBe(true)
    expect(status.getAttribute('title')).toBe(
      fallback
        ? 'Additional content is unavailable. Open Game Data for details.'
        : 'tavern-born-srd-core 1.0.0',
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

  test.each([
    ['update', 'Game data update available', 'Game data update'],
    ['review', 'Review game data', 'Review game data'],
    ['reload', 'Restore additional content', 'Restore additional content'],
    ['recovery', 'Review game data', 'Review game data'],
  ] as const)('opens the %s review independently of app updates', async (reason, linkName, title) => {
    const user = userEvent.setup()
    const openAppUpdate = vi.fn()
    vi.stubGlobal('electronAPI', { getAppVersion: () => Promise.resolve('0.6.0') })
    const data = makeGameDataFixture()
    const config = { type: 'remote' as const, path: 'https://example.test', isValid: true }
    render(
      <MemoryRouter>
        <AppStatusBar onOpenAppUpdate={openAppUpdate} />
        <Routes>
          <Route path="/" element={<p>Home</p>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'Game data update available' })).toBeNull()
    await act(() =>
      useGameDataStore.setState({
        gameData: data,
        dataSourceConfig: config,
        pendingCatalog: {
          candidate: { config, data, identity: config, keys: [], warnings: [] },
          reason,
          removals: [],
          incompleteRemovalPreview: reason !== 'update',
        },
      }),
    )
    const dataUpdate = screen.getByRole('link', { name: linkName })
    if (reason !== 'update')
      expect(screen.queryByRole('link', { name: 'Game data update available' })).toBeNull()
    const appUpdate = screen.getByRole('button', { name: 'App update available' })
    expect(dataUpdate.parentElement?.contains(screen.getByText('Additional Content Loaded'))).toBe(
      true,
    )
    expect(appUpdate.parentElement?.contains(await screen.findByText('v0.6.0'))).toBe(true)

    await user.click(appUpdate)
    expect(openAppUpdate).toHaveBeenCalledTimes(1)
    await user.click(dataUpdate)
    const heading = await screen.findByRole('heading', { name: title })
    expect(Boolean(screen.queryByText(/rebuilt rules match what you last used/))).toBe(
      reason === 'reload',
    )
    expect(Boolean(screen.queryByText(/couldn’t confirm a match/))).toBe(reason === 'recovery')
    expect(Boolean(screen.queryByText(/This preview may miss some removals/))).toBe(
      reason !== 'update',
    )
    expect(
      screen.getByRole('button', {
        name:
          reason === 'reload'
            ? 'Restore additional content'
            : reason === 'recovery'
              ? 'Use additional content'
              : 'Apply game data update',
      }),
    ).toBeTruthy()
    expect(heading.closest('section')).toBe(document.activeElement)
    expect(openAppUpdate).toHaveBeenCalledTimes(1)

    await act(() => useGameDataStore.setState({ pendingCatalog: null }))
    expect(screen.queryByRole('link', { name: linkName })).toBeNull()
    expect(screen.getByRole('button', { name: 'App update available' })).toBe(appUpdate)
  })

  test('shows the built-in rules fallback outside the footer before a preview is ready', async () => {
    const user = userEvent.setup()
    const bundled = {
      type: 'bundled' as const,
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    }
    render(
      <TooltipProvider>
        <MemoryRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<p>Characters</p>} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AppLayout>
        </MemoryRouter>
      </TooltipProvider>,
    )
    expect(screen.queryByRole('link', { name: 'Open Game Data' })).toBeNull()
    await act(() =>
      useGameDataStore.setState({
        sessionBundledSource: bundled,
        cacheStatus: 'session-srd',
        isBackgroundRefreshing: true,
      }),
    )
    expect(
      screen.getByText('Some character options may be unavailable.', { exact: false }),
    ).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Open Game Data' }))
    const section = screen.getByRole('region', { name: 'Using built-in rules' })
    expect(section.textContent).toContain('couldn’t use its saved copy')
    expect(section).toBe(document.activeElement)
    expect(screen.queryByRole('link', { name: 'Open Game Data' })).toBeNull()
    await act(() => useGameDataStore.setState({ sessionBundledSource: null }))
    expect(screen.queryByRole('region', { name: 'Using built-in rules' })).toBeNull()
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
