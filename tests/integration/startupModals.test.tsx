import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { APP_INTERACTIVE_CONTENT_ID } from '@/components/layout/AppLayout'
import { AppLoadingOverlay } from '@/components/layout/AppLoadingOverlay'
import { DataSourceStartupModal } from '@/components/settings/DataSourceStartupModal'
import { useGameDataStore } from '@/store/gameDataStore'

vi.mock('@/components/settings/DataSourceConfigurator', () => ({
  DataSourceConfigurator: ({ onCancel }: { onCancel?: () => void }) => (
    <div>
      Data Source Configurator
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Back
        </button>
      )}
    </div>
  ),
}))

const storage = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key)
  }),
  clear: vi.fn(() => {
    storage.clear()
  }),
}

function resetGameDataStore() {
  useGameDataStore.setState({
    gameData: null,
    dataSourceConfig: null,
    isLoading: false,
    isBackgroundRefreshing: false,
    loadProgress: null,
    error: null,
    lastLoadedAt: null,
    cacheStatus: 'unknown',
    remoteStartup: null,
    sessionBundledSource: null,
    hasHydrated: false,
  })
}

describe('startup integration: loading overlay and startup modal', () => {
  beforeEach(() => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(localStorageMock as unknown as Storage)
    localStorageMock.clear()
    resetGameDataStore()
  })

  afterEach(() => {
    localStorageMock.clear()
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('AppLoadingOverlay renders while hydration is incomplete', () => {
    render(<AppLoadingOverlay />)

    expect(screen.getByText('Tavern Born')).toBeTruthy()
    expect(screen.getByText('Warming up the dice...')).toBeTruthy()
  })

  test('startup recovery offers retry and source setup after both catalogs fail', async () => {
    const user = userEvent.setup()
    useGameDataStore.setState({ hasHydrated: true, remoteStartup: 'unavailable', error: 'Offline' })
    render(
      <>
        <AppLoadingOverlay />
        <DataSourceStartupModal />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByText('Game data is unavailable.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Use Included SRD/ })).toBeNull()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Change source' }))
    expect(await screen.findByRole('dialog', { name: 'Choose Game Data' })).toBeTruthy()
    expect(screen.queryByTestId('app-loading-overlay')).toBeNull()
    await act(() => useGameDataStore.setState({ isLoading: true }))
    expect(screen.getByRole('dialog', { name: 'Choose Game Data' })).toBeTruthy()
  })

  test('AppLoadingOverlay makes underlying app content inert while startup is blocked', () => {
    render(
      <>
        <div id={APP_INTERACTIVE_CONTENT_ID}>
          <button type="button">Character editor action</button>
        </div>
        <AppLoadingOverlay />
      </>,
    )

    const appContent = document.getElementById(APP_INTERACTIVE_CONTENT_ID)
    expect(appContent?.hasAttribute('inert')).toBe(true)
    expect(appContent?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Tavern Born' })).toBe(document.activeElement)
    expect(screen.getByRole('status').textContent).toContain('Warming up the dice...')
  })

  test('AppLoadingOverlay renders progress details during foreground loading', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      isLoading: true,
      isBackgroundRefreshing: false,
      loadProgress: {
        current: 2,
        total: 5,
        resource: 'classes',
      },
    })

    render(<AppLoadingOverlay />)

    expect(screen.getAllByText('Loading classes…').length).toBeGreaterThan(0)
    expect(screen.getByText(/2\s*\/\s*5/)).toBeTruthy()
  })

  test('AppLoadingOverlay releases cached data immediately during a background check', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        organizations: [],
        sources: [],
      },
      isLoading: false,
      isBackgroundRefreshing: true,
      cacheStatus: 'fresh',
    })

    render(<AppLoadingOverlay />)

    expect(screen.queryByTestId('app-loading-overlay')).toBeNull()
  })

  test('AppLoadingOverlay distinguishes cache inspection from source loading', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      isLoading: false,
      isBackgroundRefreshing: false,
      cacheStatus: 'unknown',
    })

    render(<AppLoadingOverlay />)

    expect(screen.getByText('Checking saved game data…')).toBeTruthy()
  })

  test('AppLoadingOverlay reports source connection after a cache miss starts loading', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      isLoading: true,
      isBackgroundRefreshing: false,
      cacheStatus: 'unknown',
      loadProgress: null,
    })

    render(<AppLoadingOverlay />)

    expect(screen.getByText('Connecting to game data source…')).toBeTruthy()
  })

  test('AppLoadingOverlay stays hidden for later modeless refreshes', async () => {
    vi.useFakeTimers()
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      isLoading: false,
      isBackgroundRefreshing: false,
      cacheStatus: 'unconfigured',
    })

    render(
      <>
        <div id={APP_INTERACTIVE_CONTENT_ID}>
          <button type="button">Character editor action</button>
        </div>
        <AppLoadingOverlay />
      </>,
    )

    await act(async () => vi.advanceTimersByTime(1200))
    await act(async () => vi.advanceTimersByTime(500))
    expect(screen.queryByTestId('app-loading-overlay')).toBeNull()

    await act(async () => useGameDataStore.setState({ isBackgroundRefreshing: true }))

    expect(screen.queryByTestId('app-loading-overlay')).toBeNull()
    expect(document.getElementById(APP_INTERACTIVE_CONTENT_ID)?.hasAttribute('inert')).toBe(false)
  })

  test('AppLoadingOverlay has no finish delay when hydrated and idle', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      isLoading: false,
      isBackgroundRefreshing: false,
      cacheStatus: 'unconfigured',
    })

    render(<AppLoadingOverlay />)
    expect(screen.queryByTestId('app-loading-overlay')).toBeNull()
  })

  test('DataSourceStartupModal opens when hydrated with no data and not loading', async () => {
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      isLoading: false,
      cacheStatus: 'unconfigured',
    })

    render(<DataSourceStartupModal />)

    expect(screen.getByText('Choose Game Data')).toBeTruthy()
    expect(await screen.findByText('Data Source Configurator')).toBeTruthy()
  })

  test('introduces an approved bundled source once and continues without setup', async () => {
    const user = userEvent.setup()
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        organizations: [],
        sources: [],
      },
      dataSourceConfig: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
      isLoading: false,
      cacheStatus: 'fetched',
    })

    render(<DataSourceStartupModal />)

    expect(screen.getByText('Welcome to Tavern Born')).toBeTruthy()
    expect(screen.getByText('Your adventure starts here.')).toBeTruthy()
    expect(screen.getByText('Ready to Create')).toBeTruthy()
    expect(screen.getByText(/includes the 2014 and 2024 5e SRDs/)).toBeTruthy()
    expect(
      screen.getByText(/expand your options with additional content now or anytime later/),
    ).toBeTruthy()
    expect(screen.queryByText('Data Source Configurator')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Get Started' }))

    expect(localStorageMock.setItem).toHaveBeenCalledWith('tb:bundled-srd-intro:v1', '1')
    expect(screen.queryByText('Welcome to Tavern Born')).toBeNull()
  })

  test('opens optional external setup and can return to the bundled introduction', async () => {
    const user = userEvent.setup()
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        organizations: [],
        sources: [],
      },
      dataSourceConfig: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
      isLoading: false,
      cacheStatus: 'fetched',
    })

    render(<DataSourceStartupModal />)
    await user.click(screen.getByRole('button', { name: 'Add Additional Content' }))

    expect(screen.getByText('Add Additional Content')).toBeTruthy()
    expect(screen.getByText('Data Source Configurator')).toBeTruthy()
    expect(screen.getByText('Expand your character choices.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByText('Welcome to Tavern Born')).toBeTruthy()
    expect(screen.queryByText('Data Source Configurator')).toBeNull()
    expect(storage.get('tb:bundled-srd-intro:v1')).toBeUndefined()
  })

  test('DataSourceStartupModal remains closed when game data already exists', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        organizations: [],
        sources: [],
      },
      isLoading: false,
    })

    const { container } = render(<DataSourceStartupModal />)
    expect(container.textContent).toBe('')
  })

  test('DataSourceStartupModal forced mode opens with setup title', async () => {
    localStorage.setItem('tb:force-setup', '1')
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        organizations: [],
        sources: [],
      },
      isLoading: false,
      cacheStatus: 'fresh',
    })

    render(<DataSourceStartupModal />)

    expect(screen.getByText('Game Data Setup')).toBeTruthy()
    expect(await screen.findByText('Data Source Configurator')).toBeTruthy()
  })
})
