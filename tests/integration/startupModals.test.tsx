import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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

    expect(screen.getByText('Choose Game Data')).toBeTruthy()
    expect(screen.getByText('Data Source Configurator')).toBeTruthy()
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
    expect(screen.getByText('Content & Options')).toBeTruthy()
    expect(screen.getByText(/includes SRD content for both 5e 2014 and 5.5e 2024/)).toBeTruthy()
    expect(screen.getByText(/add more now or anytime later from Settings/)).toBeTruthy()
    expect(screen.queryByText('Data Source Configurator')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Continue with Included SRD' }))

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
    expect(screen.getByText(/Want more character options/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '5etools community wiki' }).getAttribute('href')).toBe(
      'https://wiki.tercept.net/en/5eTools/InstallGuide',
    )

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
    expect(screen.getByText('Data Source Configurator')).toBeTruthy()
  })
})
