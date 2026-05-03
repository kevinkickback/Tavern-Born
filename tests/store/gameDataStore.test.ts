import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { DataSourceConfig, GameData } from '@/types/5etools'

const { loadDataFromSourceMock, writeGameDataCacheMock, clearGameDataCacheMock } = vi.hoisted(
  () => ({
    loadDataFromSourceMock: vi.fn(),
    writeGameDataCacheMock: vi.fn(async () => ({ lastDataChangedAt: '2026-01-01T00:00:00.000Z' })),
    clearGameDataCacheMock: vi.fn(async () => undefined),
  }),
)

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/lib/5etools', () => ({
  loadDataFromSource: loadDataFromSourceMock,
}))

vi.mock('@/lib/storage/dataCache', () => ({
  writeGameDataCache: writeGameDataCacheMock,
  clearGameDataCache: clearGameDataCacheMock,
}))

import { useGameDataStore } from '@/store/gameDataStore'

function makeGameDataFixture(): GameData {
  return {
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
  }
}

describe('gameDataStore', () => {
  const config: DataSourceConfig = {
    type: 'local',
    path: '/data',
    isValid: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  test('loadGameData foreground success updates data and cache status', async () => {
    const data = makeGameDataFixture()
    loadDataFromSourceMock.mockImplementation((_cfg, opts) => {
      opts?.onProgress?.(1, 2, 'classes')
      return Promise.resolve(data)
    })

    await useGameDataStore.getState().loadGameData(config)

    const state = useGameDataStore.getState()
    expect(loadDataFromSourceMock).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(writeGameDataCacheMock).toHaveBeenCalledWith(data, config)
    expect(state.gameData).toEqual(data)
    expect(state.dataSourceConfig?.isValid).toBe(true)
    expect(state.cacheStatus).toBe('fetched')
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  test('loadGameData background success toggles background flag', async () => {
    loadDataFromSourceMock.mockResolvedValue(makeGameDataFixture())

    await useGameDataStore.getState().loadGameData(config, true)

    const state = useGameDataStore.getState()
    expect(state.isBackgroundRefreshing).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.loadProgress).toBeNull()
  })

  test('loadGameData handles loader errors', async () => {
    loadDataFromSourceMock.mockRejectedValue(new Error('boom'))

    await useGameDataStore.getState().loadGameData(config)

    const state = useGameDataStore.getState()
    expect(state.error).toBe('boom')
    expect(state.isLoading).toBe(false)
    expect(state.isBackgroundRefreshing).toBe(false)
  })

  test('refreshGameData uses stored config', async () => {
    loadDataFromSourceMock.mockResolvedValue(makeGameDataFixture())
    useGameDataStore.setState({ dataSourceConfig: config })

    await useGameDataStore.getState().refreshGameData()

    expect(loadDataFromSourceMock).toHaveBeenCalledTimes(1)
  })

  test('refreshGameData does nothing when no config exists', async () => {
    await useGameDataStore.getState().refreshGameData()

    expect(loadDataFromSourceMock).not.toHaveBeenCalled()
  })

  test('persist partialize keeps only config and timestamp fields', () => {
    const storeWithPersist = useGameDataStore as unknown as {
      persist: {
        getOptions: () => {
          partialize: (state: ReturnType<typeof useGameDataStore.getState>) => {
            dataSourceConfig: DataSourceConfig | null
            lastLoadedAt: string | null
          }
        }
      }
    }

    const partialize = storeWithPersist.persist.getOptions().partialize
    const partialized = partialize({
      ...useGameDataStore.getState(),
      gameData: makeGameDataFixture(),
      dataSourceConfig: config,
      lastLoadedAt: '2026-01-01T00:00:00.000Z',
      lastDataChangedAt: null,
      lastUpdateCheckAt: null,
    })

    expect(partialized).toEqual({
      dataSourceConfig: config,
      lastLoadedAt: '2026-01-01T00:00:00.000Z',
      lastDataChangedAt: null,
      lastUpdateCheckAt: null,
    })
  })

  test('persist rehydrate callback marks store as hydrated', () => {
    const setHasHydrated = vi.fn()
    const storeWithPersist = useGameDataStore as unknown as {
      persist: {
        getOptions: () => {
          onRehydrateStorage?: () =>
            | ((state?: { setHasHydrated: (v: boolean) => void }) => void)
            | undefined
        }
      }
    }

    const onRehydrate = storeWithPersist.persist.getOptions().onRehydrateStorage?.()
    onRehydrate?.({ setHasHydrated })

    expect(setHasHydrated).toHaveBeenCalledWith(true)
  })

  test('clearGameData resets store and clears cache', () => {
    useGameDataStore.setState({
      gameData: makeGameDataFixture(),
      dataSourceConfig: config,
      cacheStatus: 'fetched',
      isLoading: true,
    })

    useGameDataStore.getState().clearGameData()

    const state = useGameDataStore.getState()
    expect(clearGameDataCacheMock).toHaveBeenCalledTimes(1)
    expect(state.gameData).toBeNull()
    expect(state.dataSourceConfig).toBeNull()
    expect(state.cacheStatus).toBe('unconfigured')
    expect(state.isLoading).toBe(false)
  })
})
