import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppLoadingOverlay } from '@/components/layout/AppLoadingOverlay'
import { DataSourceStartupModal } from '@/components/settings/DataSourceStartupModal'
import { useGameDataStore } from '@/store/gameDataStore'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/components/settings/DataSourceConfigurator', () => ({
  DataSourceConfigurator: () => <div>Data Source Configurator</div>,
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
    vi.restoreAllMocks()
  })

  test('AppLoadingOverlay renders while hydration is incomplete', () => {
    render(<AppLoadingOverlay />)

    expect(screen.getByText('Tavern Born')).toBeTruthy()
    expect(screen.getByText('Reading saved settings…')).toBeTruthy()
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

  test('AppLoadingOverlay shows ready state when hydrated and idle', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      isLoading: false,
      isBackgroundRefreshing: false,
      cacheStatus: 'unconfigured',
    })

    render(<AppLoadingOverlay />)
    expect(screen.getByText('App is ready')).toBeTruthy()
  })

  test('DataSourceStartupModal opens when hydrated with no data and not loading', () => {
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      isLoading: false,
      cacheStatus: 'unconfigured',
    })

    render(<DataSourceStartupModal />)

    expect(screen.getByText('Welcome to Tavern Born')).toBeTruthy()
    expect(screen.getByText('Data Source Configurator')).toBeTruthy()
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
        magicvariants: [],
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

  test('DataSourceStartupModal forced mode opens with setup title', () => {
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
        magicvariants: [],
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

    expect(screen.getByText('Data Source Setup')).toBeTruthy()
    expect(screen.getByText('Data Source Configurator')).toBeTruthy()
  })
})
