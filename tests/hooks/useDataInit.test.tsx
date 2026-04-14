import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/lib/storage/dataCache', () => ({
  readGameDataCache: vi.fn(async () => null),
  isCacheForSource: vi.fn(() => false),
  isCacheStale: vi.fn(() => false),
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { useDataInit } from '@/hooks/data/useDataInit'
import { isCacheForSource, isCacheStale, readGameDataCache } from '@/lib/storage/dataCache'
import { useGameDataStore } from '@/store/gameDataStore'
import type { DataSourceConfig, GameData } from '@/types/5etools'

function makeGameData(): GameData {
  return {
    races: [],
    classes: [],
    backgrounds: [],
    spells: [],
    feats: [],
    items: [],
    itemsBase: [],
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
    sources: [],
  }
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
    lastDataChangedAt: null,
    lastUpdateCheckAt: null,
    cacheStatus: 'unknown',
    hasHydrated: false,
  })
}

describe('useDataInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGameDataStore()
  })

  afterEach(() => {
    resetGameDataStore()
    vi.restoreAllMocks()
  })

  test('sets unconfigured status when no cache and no source are available', async () => {
    const loadGameDataMock = vi.fn(async () => undefined)
    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      dataSourceConfig: null,
      isLoading: false,
      loadGameData: loadGameDataMock,
    })

    renderHook(() => useDataInit())

    await waitFor(() => {
      expect(useGameDataStore.getState().cacheStatus).toBe('unconfigured')
    })
    expect(loadGameDataMock).not.toHaveBeenCalled()
  })

  test('serves stale cache immediately and triggers background refresh', async () => {
    const config: DataSourceConfig = {
      type: 'remote',
      path: 'https://example.com/5etools',
      isValid: true,
    }
    const cacheData = makeGameData()
    const loadGameDataMock = vi.fn(async () => undefined)

    vi.mocked(readGameDataCache).mockResolvedValue({
      data: cacheData,
      cachedAt: '2026-04-01T00:00:00.000Z',
      sourceSnapshot: { type: 'remote', path: 'https://example.com/5etools' },
      lastDataChangedAt: '2026-04-01T00:00:00.000Z',
    })
    vi.mocked(isCacheForSource).mockReturnValue(true)
    vi.mocked(isCacheStale).mockReturnValue(true)

    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      dataSourceConfig: config,
      isLoading: false,
      loadGameData: loadGameDataMock,
    })

    renderHook(() => useDataInit())

    await waitFor(() => {
      expect(useGameDataStore.getState().cacheStatus).toBe('stale')
    })
    expect(useGameDataStore.getState().gameData).toEqual(cacheData)
    expect(loadGameDataMock).toHaveBeenCalledWith(config, true)
    expect(toast.info).toHaveBeenCalled()
  })

  test('uses offline cache when source config is missing', async () => {
    const cacheData = makeGameData()

    vi.mocked(readGameDataCache).mockResolvedValue({
      data: cacheData,
      cachedAt: '2026-04-01T00:00:00.000Z',
      sourceSnapshot: { type: 'remote', path: 'https://example.com/5etools' },
      lastDataChangedAt: '2026-04-01T00:00:00.000Z',
    })

    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      dataSourceConfig: null,
      isLoading: false,
    })

    renderHook(() => useDataInit())

    await waitFor(() => {
      expect(useGameDataStore.getState().cacheStatus).toBe('offline')
    })
    expect(useGameDataStore.getState().gameData).toEqual(cacheData)
    expect(toast.warning).toHaveBeenCalled()
  })

  test('fetches fresh when cache is for a different source', async () => {
    const config: DataSourceConfig = {
      type: 'remote',
      path: 'https://example.com/5etools-new',
      isValid: true,
    }
    const cacheData = makeGameData()
    const loadGameDataMock = vi.fn(async () => undefined)

    vi.mocked(readGameDataCache).mockResolvedValue({
      data: cacheData,
      cachedAt: '2026-04-01T00:00:00.000Z',
      sourceSnapshot: { type: 'remote', path: 'https://example.com/5etools-old' },
      lastDataChangedAt: '2026-04-01T00:00:00.000Z',
    })
    vi.mocked(isCacheForSource).mockReturnValue(false)

    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      dataSourceConfig: config,
      isLoading: false,
      loadGameData: loadGameDataMock,
    })

    renderHook(() => useDataInit())

    await waitFor(() => {
      expect(loadGameDataMock).toHaveBeenCalledWith(config)
    })
    expect(useGameDataStore.getState().gameData).toBeNull()
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })

  test('serves fresh cache immediately and triggers background verify', async () => {
    const config: DataSourceConfig = {
      type: 'remote',
      path: 'https://example.com/5etools',
      isValid: true,
    }
    const cacheData = makeGameData()
    const loadGameDataMock = vi.fn(async () => undefined)

    vi.mocked(readGameDataCache).mockResolvedValue({
      data: cacheData,
      cachedAt: new Date().toISOString(),
      sourceSnapshot: { type: 'remote', path: 'https://example.com/5etools' },
      lastDataChangedAt: new Date().toISOString(),
    })
    vi.mocked(isCacheForSource).mockReturnValue(true)
    vi.mocked(isCacheStale).mockReturnValue(false)

    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      dataSourceConfig: config,
      isLoading: false,
      loadGameData: loadGameDataMock,
    })

    renderHook(() => useDataInit())

    await waitFor(() => {
      expect(useGameDataStore.getState().cacheStatus).toBe('fresh')
    })
    expect(useGameDataStore.getState().gameData).toEqual(cacheData)
    expect(loadGameDataMock).toHaveBeenCalledWith(config, true)
    expect(toast.info).not.toHaveBeenCalled()
  })

  test('loads from source directly when no cache exists', async () => {
    const config: DataSourceConfig = {
      type: 'remote',
      path: 'https://example.com/5etools',
      isValid: true,
    }
    const loadGameDataMock = vi.fn(async () => undefined)

    vi.mocked(readGameDataCache).mockResolvedValue(null)

    useGameDataStore.setState({
      hasHydrated: true,
      gameData: null,
      dataSourceConfig: config,
      isLoading: false,
      loadGameData: loadGameDataMock,
    })

    renderHook(() => useDataInit())

    await waitFor(() => {
      expect(loadGameDataMock).toHaveBeenCalledWith(config)
    })
    expect(useGameDataStore.getState().gameData).toBeNull()
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })
})
