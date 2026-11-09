import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DataSourceConfig, GameData } from '@/types/5etools'

const {
  loadDataFromSourceMock,
  loadGameDataSourceStackMock,
  writeGameDataCacheMock,
  readGameDataCacheMock,
} = vi.hoisted(() => ({
  loadDataFromSourceMock: vi.fn(),
  loadGameDataSourceStackMock: vi.fn(),
  writeGameDataCacheMock: vi.fn(async () => ({
    lastDataChangedAt: '2026-01-01T00:00:00.000Z',
    contentFingerprint: 'abc123ef',
  })),
  readGameDataCacheMock: vi.fn(),
}))
const { resolveDefaultBundledSourceMock } = vi.hoisted(() => ({
  resolveDefaultBundledSourceMock: vi.fn<() => Promise<DataSourceConfig | null>>(async () => null),
}))

vi.mock(import('@/lib/5etools/dataLoader'), async (importOriginal) => ({
  ...(await importOriginal()),
  loadDataFromSource: loadDataFromSourceMock,
}))

vi.mock(import('@/lib/5etools/contentLayers'), async (importOriginal) => ({
  ...(await importOriginal()),
  loadGameDataSourceStack: loadGameDataSourceStackMock,
}))

vi.mock('@/lib/5etools/bundledSource', () => ({
  resolveDefaultBundledSource: resolveDefaultBundledSourceMock,
}))

vi.mock('@/lib/5etools/catalogCandidate', () => ({
  prepareCatalog: async (
    config: DataSourceConfig,
    base: DataSourceConfig | undefined,
    signal: AbortSignal,
    onProgress: unknown,
  ) => {
    const failed: string[] = []
    const layerMetadata: Record<string, unknown> = {}
    const options = {
      signal,
      onProgress,
      onResourceFailure: (resource: string, result: { required: boolean }) => {
        if (result.required) failed.push(resource)
      },
      onLayerLoaded: (role: string, data: GameData) => {
        layerMetadata[role] = {
          contentFingerprint: 'layer-fingerprint',
          entityCount: data.races.length,
        }
      },
    }
    const identity = base ? { base, additional: config } : config
    const data = await (base
      ? loadGameDataSourceStackMock(identity, options)
      : loadDataFromSourceMock(config, options))
    if (failed.length) throw new Error(`Could not load required game data. ${failed.join(', ')}`)
    return {
      config,
      identity,
      data,
      warnings: [],
      keys: [],
      layerMetadata: base ? layerMetadata : undefined,
    }
  },
}))

vi.mock('@/lib/storage/dataCache', () => ({
  GAME_DATA_SETTINGS_KEY: 'game-data-storage',
  GAME_DATA_STORE_VERSION: 1,
  writeGameDataCache: writeGameDataCacheMock,
  readGameDataCachePair: async () => ({ cache: await readGameDataCacheMock() }),
  isCacheForSource: (cache: { sourceSnapshot: { path: string } }, config: DataSourceConfig) =>
    cache.sourceSnapshot.path === config.path,
  computeGameDataFingerprint: () => 'layer-fingerprint',
}))

import { expandItemEntries } from '@/lib/5etools/itemEntries'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  INTERACTIVE_CATALOG_TIMEOUT_MS,
  STARTUP_CATALOG_TIMEOUT_MS,
  useGameDataStore,
} from '@/store/gameDataStore'
import { firePotion } from '../fixtures/itemEntryFixtures'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

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
    resolveDefaultBundledSourceMock.mockResolvedValue(null)
    readGameDataCacheMock.mockResolvedValue(null)
    useGameDataStore.setState({
      gameData: null,
      dataSourceConfig: null,
      isLoading: false,
      isBackgroundRefreshing: false,
      loadProgress: null,
      error: null,
      lastDataChangedAt: null,
      lastContentFingerprint: null,
      lastUpdateCheckAt: null,
      pendingCatalog: null,
      externalKeys: undefined,
      cacheStatus: 'unknown',
      remoteStartup: null,
      bundledUnavailable: false,
      sessionBundledSource: null,
      hasHydrated: false,
    })
  })

  afterEach(() => vi.useRealTimers())

  const remote: DataSourceConfig = {
    type: 'remote',
    path: 'https://example.test/data',
    isValid: true,
  }

  const bundled: DataSourceConfig = {
    type: 'bundled',
    path: 'srd/core',
    packId: 'core',
    packVersion: '1.0.0',
    isValid: true,
  }
  const nonempty = (name: string) => ({
    ...makeGameDataFixture(),
    races: [{ name, source: 'PHB' }] as GameData['races'],
  })

  test('a matching cache opens before the optional check settles', async () => {
    const cached = nonempty('Saved race')
    const late = deferred<GameData>()
    readGameDataCacheMock.mockResolvedValue({
      data: cached,
      sourceSnapshot: { path: remote.path },
      cachedAt: '2026-01-01T00:00:00.000Z',
    })
    useGameDataStore.setState({ dataSourceConfig: remote })
    loadDataFromSourceMock.mockReturnValueOnce(late.promise)
    const { backgroundRefresh } = await useGameDataStore
      .getState()
      .loadFromCache({ checkForUpdates: true })
    expect(useGameDataStore.getState().gameData?.races).toEqual(cached.races)
    expect(useGameDataStore.getState().isBackgroundRefreshing).toBe(true)
    const next = nonempty('New race')
    useGameDataStore.setState({ lastContentFingerprint: 'previous-fingerprint' })
    late.resolve(next)
    await backgroundRefresh
    expect(useGameDataStore.getState().pendingCatalog?.candidate).toMatchObject({ data: next })
    expect(useGameDataStore.getState().gameData?.races).toEqual(cached.races)
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
    const { candidate } = useGameDataStore.getState().pendingCatalog!
    expect(
      (
        await useGameDataStore
          .getState()
          .loadCatalog(remote, false, { prepared: candidate, confirmed: true })
      ).kind,
    ).toBe('applied')
    expect(useGameDataStore.getState().gameData).toBe(next)
  })

  test.each([
    remote,
    { ...remote, path: 'https://replacement.example.test' },
  ])('an exact external withdrawal requires confirmation for source %j', async (next) => {
    const data = nonempty('Same name')
    const key = 'races: same name|phb'
    const candidate = { config: next, identity: next, data, keys: [], warnings: [] }
    useGameDataStore.setState({
      gameData: data,
      dataSourceConfig: remote,
      lastContentFingerprint: 'layer-fingerprint',
      externalKeys: [key],
    })

    const { loadCatalog } = useGameDataStore.getState()
    expect((await loadCatalog(next, false, { prepared: candidate })).kind).toBe('staged')
    expect(useGameDataStore.getState().pendingCatalog?.removals).toEqual([key])
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()

    expect((await loadCatalog(next, false, { prepared: candidate, confirmed: true })).kind).toBe(
      'applied',
    )
    expect(useGameDataStore.getState().externalKeys).toEqual([])
  })

  test.each([
    { background: true, next: remote },
    { background: false, next: { ...remote, path: 'https://replacement.example.test' } },
  ])('legacy inventory requires one-time review of equal composed data ($background)', async ({
    background,
    next,
  }) => {
    const data = nonempty('Same name in the Included SRD')
    const candidate = {
      config: next,
      identity: { base: bundled, additional: next },
      data,
      keys: ['feats: retained|phb'],
      warnings: [],
    }
    useGameDataStore.setState({
      gameData: data,
      dataSourceConfig: remote,
      lastContentFingerprint: 'layer-fingerprint',
    })
    const { loadCatalog } = useGameDataStore.getState()

    expect(await loadCatalog(next, background, { prepared: candidate })).toMatchObject({
      kind: 'staged',
    })
    expect(useGameDataStore.getState().pendingCatalog).toMatchObject({
      candidate,
      removals: [],
      incompleteRemovalPreview: true,
    })
    expect(useGameDataStore.getState().dataSourceConfig).toBe(remote)
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()

    writeGameDataCacheMock.mockResolvedValueOnce({
      contentFingerprint: 'layer-fingerprint',
      lastDataChangedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(await loadCatalog(next, false, { prepared: candidate, confirmed: true })).toMatchObject({
      kind: 'applied',
    })
    expect(writeGameDataCacheMock).toHaveBeenCalledWith(
      data,
      candidate.identity,
      expect.objectContaining({ externalKeys: candidate.keys }),
    )
    expect(await loadCatalog(next, true, { prepared: candidate })).toMatchObject({
      kind: 'applied',
    })
    expect(useGameDataStore.getState().pendingCatalog).toBeNull()
  })

  test('an acknowledged write stays active when a newer attempt fails', async () => {
    const data = nonempty('Committed race')
    const commit = deferred<{ lastDataChangedAt: string; contentFingerprint: string }>()
    writeGameDataCacheMock.mockReturnValueOnce(commit.promise)
    loadDataFromSourceMock
      .mockResolvedValueOnce(data)
      .mockRejectedValueOnce(new Error('New source failed'))
    const { loadCatalog } = useGameDataStore.getState()
    const first = loadCatalog(config)
    await vi.waitFor(() => expect(writeGameDataCacheMock).toHaveBeenCalledTimes(1))
    const second = loadCatalog(remote)
    commit.resolve({
      lastDataChangedAt: '2026-01-01T00:00:00.000Z',
      contentFingerprint: 'acknowledged',
    })
    await Promise.all([first, second])
    expect(useGameDataStore.getState()).toMatchObject({
      gameData: data,
      dataSourceConfig: config,
      error: 'New source failed',
    })
  })

  test('cold startup loads the SRD before checking the configured source', async () => {
    const included = nonempty('Included race')
    const late = deferred<GameData>()
    useGameDataStore.setState({ dataSourceConfig: remote })
    resolveDefaultBundledSourceMock.mockResolvedValue(bundled)
    loadDataFromSourceMock.mockResolvedValueOnce(included)
    loadGameDataSourceStackMock.mockReturnValueOnce(late.promise)

    const { backgroundRefresh } = await useGameDataStore
      .getState()
      .loadFromCache({ checkForUpdates: true })
    expect(useGameDataStore.getState()).toMatchObject({
      gameData: included,
      sessionBundledSource: bundled,
      dataSourceConfig: remote,
      cacheStatus: 'session-srd',
    })
    late.resolve(nonempty('Online race'))
    await backgroundRefresh
    expect(useGameDataStore.getState().pendingCatalog).not.toBeNull()
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test('startup skips automatic reads of the configured source when updates are off', async () => {
    useGameDataStore.setState({ dataSourceConfig: remote })
    resolveDefaultBundledSourceMock.mockResolvedValue(bundled)
    loadDataFromSourceMock.mockResolvedValueOnce(nonempty('Included race'))
    await expect(
      useGameDataStore.getState().loadFromCache({ checkForUpdates: false }),
    ).resolves.toEqual({})
    expect(useGameDataStore.getState().cacheStatus).toBe('session-srd')
    expect(loadGameDataSourceStackMock).not.toHaveBeenCalled()
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test('explicit retry can admit a standalone source when the desktop pack is unavailable', async () => {
    const original = window.electronAPI
    vi.stubGlobal('electronAPI', {
      getBundledManifest: () => Promise.reject(new Error('Unavailable')),
    })
    try {
      useGameDataStore.setState({ dataSourceConfig: remote })
      await useGameDataStore.getState().loadFromCache({ checkForUpdates: true })
      expect(useGameDataStore.getState().remoteStartup).toBe('unavailable')
      expect(loadDataFromSourceMock).not.toHaveBeenCalled()
      const catalog = nonempty('Online race')
      loadDataFromSourceMock.mockResolvedValueOnce(catalog)
      await useGameDataStore.getState().loadFromCache({ retry: true })
      expect(useGameDataStore.getState()).toMatchObject({ gameData: catalog, remoteStartup: null })
    } finally {
      vi.unstubAllGlobals()
      if (original) window.electronAPI = original
    }
  })

  test('a damaged pack with a valid manifest allows standalone recovery', async () => {
    useGameDataStore.setState({ dataSourceConfig: remote })
    resolveDefaultBundledSourceMock.mockResolvedValue(bundled)
    loadDataFromSourceMock
      .mockRejectedValueOnce(new Error('Damaged pack'))
      .mockRejectedValueOnce(new Error('Damaged pack'))
      .mockResolvedValueOnce(nonempty('Recovered remote'))
    await useGameDataStore.getState().loadFromCache({ checkForUpdates: true })
    expect(useGameDataStore.getState()).toMatchObject({
      bundledUnavailable: true,
      remoteStartup: 'unavailable',
    })
    await useGameDataStore.getState().loadFromCache({ retry: true })
    expect(useGameDataStore.getState()).toMatchObject({
      gameData: nonempty('Recovered remote'),
      bundledUnavailable: true,
      remoteStartup: null,
    })
    expect(loadGameDataSourceStackMock).not.toHaveBeenCalled()
  })

  test('retry with withdrawals opens review even without an active catalog', async () => {
    useGameDataStore.setState({
      dataSourceConfig: { ...remote, availableResources: ['races.json', 'feats.json'] },
      externalKeys: ['feats: unavailable|test'],
    })
    loadDataFromSourceMock.mockResolvedValueOnce(nonempty('Recovered remote'))
    await useGameDataStore.getState().loadFromCache({ retry: true })
    expect(useGameDataStore.getState()).toMatchObject({
      gameData: null,
      remoteStartup: 'setup',
      cacheStatus: 'unconfigured',
      pendingCatalog: { removals: ['feats: unavailable|test'] },
    })
  })

  test('a mismatched bundled pack retains the external inventory for removal review', async () => {
    const key = 'races: withdrawn|test'
    useGameDataStore.setState({ dataSourceConfig: remote })
    resolveDefaultBundledSourceMock.mockResolvedValue(bundled)
    readGameDataCacheMock.mockResolvedValue({
      data: nonempty('Withdrawn'),
      externalKeys: [key],
      sourceSnapshot: { type: 'remote', path: remote.path },
    })
    loadDataFromSourceMock.mockResolvedValueOnce(nonempty('Included race'))
    loadGameDataSourceStackMock.mockResolvedValueOnce(nonempty('New race'))
    const { backgroundRefresh } = await useGameDataStore
      .getState()
      .loadFromCache({ checkForUpdates: true })
    await backgroundRefresh
    expect(useGameDataStore.getState().pendingCatalog?.removals).toEqual([key])
  })

  test('reaches recovery if the bundled read stalls and allows a slower retry', async () => {
    vi.useFakeTimers()
    const late = deferred<GameData>()
    useGameDataStore.setState({ dataSourceConfig: remote })
    resolveDefaultBundledSourceMock.mockResolvedValue(bundled)
    loadDataFromSourceMock.mockReturnValueOnce(late.promise)
    const startup = useGameDataStore.getState().loadFromCache({ checkForUpdates: true })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(STARTUP_CATALOG_TIMEOUT_MS)
    await startup
    late.resolve(nonempty('Late bundled data'))
    await vi.advanceTimersByTimeAsync(0)
    expect(useGameDataStore.getState()).toMatchObject({
      dataSourceConfig: remote,
      gameData: null,
      remoteStartup: 'unavailable',
    })
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()

    const retryRead = deferred<GameData>()
    loadDataFromSourceMock.mockReturnValueOnce(retryRead.promise)
    const retry = useGameDataStore.getState().loadFromCache({ retry: true })
    await vi.advanceTimersByTimeAsync(STARTUP_CATALOG_TIMEOUT_MS + 1)
    expect(useGameDataStore.getState().remoteStartup).toBe('loading-srd')
    const recovered = nonempty('Recovered bundled data')
    retryRead.resolve(recovered)
    await retry
    expect(useGameDataStore.getState()).toMatchObject({
      dataSourceConfig: remote,
      gameData: recovered,
      remoteStartup: null,
      cacheStatus: 'session-srd',
    })
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test('a staged check that times out retains the admitted cache', async () => {
    vi.useFakeTimers()
    const cached = nonempty('Saved race')
    const late = deferred<GameData>()
    readGameDataCacheMock.mockResolvedValue({
      data: cached,
      sourceSnapshot: { path: remote.path },
      cachedAt: '2026-01-01T00:00:00.000Z',
    })
    useGameDataStore.setState({ dataSourceConfig: remote })
    loadDataFromSourceMock.mockReturnValueOnce(late.promise)
    const { backgroundRefresh } = await useGameDataStore
      .getState()
      .loadFromCache({ checkForUpdates: true })
    await vi.advanceTimersByTimeAsync(STARTUP_CATALOG_TIMEOUT_MS)
    await backgroundRefresh
    late.resolve(nonempty('Late race'))
    await vi.advanceTimersByTimeAsync(0)
    expect(useGameDataStore.getState().gameData?.races).toEqual(cached.races)
    expect(useGameDataStore.getState().pendingCatalog).toBeNull()
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test.each([config, bundled])('manual $type loading can outlast startup', async (source) => {
    vi.useFakeTimers()
    const late = deferred<GameData>()
    const data = nonempty('Slow catalog race')
    loadDataFromSourceMock.mockReturnValueOnce(late.promise)

    const loading = useGameDataStore.getState().loadCatalog(source)
    await vi.advanceTimersByTimeAsync(STARTUP_CATALOG_TIMEOUT_MS + 1)
    expect(useGameDataStore.getState().isLoading).toBe(true)
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()

    late.resolve(data)
    expect(await loading).toMatchObject({ kind: 'applied' })
    expect(useGameDataStore.getState().gameData).toBe(data)
  })

  test('a timed-out manual load preserves the accepted catalog and ignores late reads', async () => {
    vi.useFakeTimers()
    const previous = nonempty('Accepted race')
    const late = deferred<GameData>()
    useGameDataStore.setState({ dataSourceConfig: config, gameData: previous })
    loadDataFromSourceMock.mockReturnValueOnce(late.promise)

    const loading = useGameDataStore.getState().loadCatalog(config)
    await vi.advanceTimersByTimeAsync(INTERACTIVE_CATALOG_TIMEOUT_MS)
    expect(await loading).toEqual({
      kind: 'rejected',
      message: 'The game data source did not respond within 60 seconds.',
    })
    late.resolve(nonempty('Late race'))
    await vi.advanceTimersByTimeAsync(0)
    expect(useGameDataStore.getState()).toMatchObject({
      gameData: previous,
      dataSourceConfig: config,
      isLoading: false,
    })
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test('a supplied empty lookup map remains authoritative and retains indexed data identity', () => {
    const data = makeGameDataFixture()
    data.lookups = buildGameDataLookups(data)
    const indexes = data.lookups
    useGameDataStore.getState().setGameData(data)
    expect(useGameDataStore.getState().gameData).toBe(data)
    expect(useGameDataStore.getState().gameData?.lookups).toBe(indexes)
    expect(indexes.spellsByKey).toEqual({})
  })

  test('loadCatalog foreground success updates data and cache status', async () => {
    const data = makeGameDataFixture()
    loadDataFromSourceMock.mockImplementation((_cfg, opts) => {
      opts?.onProgress?.(1, 2, 'classes')
      return Promise.resolve(data)
    })

    const result = await useGameDataStore.getState().loadCatalog(config)

    const state = useGameDataStore.getState()
    expect(loadDataFromSourceMock).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(writeGameDataCacheMock).toHaveBeenCalledWith(
      data,
      config,
      expect.objectContaining({ fingerprint: null, lastDataChangedAt: null }),
    )
    expect(state.gameData).toEqual(data)
    expect(state.dataSourceConfig?.isValid).toBe(true)
    expect(state.cacheStatus).toBe('fetched')
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(result).toEqual({ kind: 'applied', changed: true })
  })

  test('loads external content above the Included SRD and caches both source identities', async () => {
    const data = makeGameDataFixture()
    const bundledConfig: DataSourceConfig = {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    }
    resolveDefaultBundledSourceMock.mockResolvedValue(bundledConfig)
    loadGameDataSourceStackMock.mockImplementation((_stack, options) => {
      options?.onLayerLoaded?.('base', data)
      options?.onLayerLoaded?.('additional', data)
      return Promise.resolve(data)
    })

    await useGameDataStore.getState().loadCatalog(config)

    const expectedStack = { base: bundledConfig, additional: config }
    expect(loadGameDataSourceStackMock).toHaveBeenCalledWith(
      expectedStack,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(loadDataFromSourceMock).not.toHaveBeenCalled()
    expect(writeGameDataCacheMock).toHaveBeenCalledWith(
      data,
      expectedStack,
      expect.objectContaining({
        fingerprint: null,
        lastDataChangedAt: null,
        layerMetadata: {
          base: { contentFingerprint: 'layer-fingerprint', entityCount: 0 },
          additional: { contentFingerprint: 'layer-fingerprint', entityCount: 0 },
        },
      }),
    )
  })

  test('ignores progress reported by a superseded load', async () => {
    let firstProgress: ((current: number, total: number, resource: string) => void) | undefined
    let secondProgress: ((current: number, total: number, resource: string) => void) | undefined
    let resolveFirst: ((data: GameData) => void) | undefined
    let resolveSecond: ((data: GameData) => void) | undefined
    loadDataFromSourceMock
      .mockImplementationOnce((_config, options) => {
        firstProgress = options?.onProgress
        return new Promise<GameData>((resolve) => {
          resolveFirst = resolve
        })
      })
      .mockImplementationOnce((_config, options) => {
        secondProgress = options?.onProgress
        return new Promise<GameData>((resolve) => {
          resolveSecond = resolve
        })
      })

    const firstLoad = useGameDataStore.getState().loadCatalog(config)
    await vi.waitFor(() => expect(firstProgress).toBeTypeOf('function'))
    const secondLoad = useGameDataStore.getState().loadCatalog({ ...config, path: '/new-data' })
    await vi.waitFor(() => {
      expect(firstProgress).toBeTypeOf('function')
      expect(secondProgress).toBeTypeOf('function')
    })
    secondProgress?.(1, 4, 'new/classes')
    firstProgress?.(9, 10, 'old/spells')

    expect(useGameDataStore.getState().loadProgress).toEqual({
      current: 1,
      total: 4,
      resource: 'new/classes',
    })

    resolveSecond?.(makeGameDataFixture())
    await secondLoad
    resolveFirst?.(makeGameDataFixture())
    await firstLoad
  })

  test('loadCatalog reports unchanged content without replacing in-memory data', async () => {
    const data = makeGameDataFixture()
    const lastDataChangedAt = '2026-01-01T00:00:00.000Z'
    loadDataFromSourceMock.mockResolvedValue(data)
    writeGameDataCacheMock.mockResolvedValueOnce({
      lastDataChangedAt,
      contentFingerprint: 'layer-fingerprint',
    })
    useGameDataStore.setState({
      gameData: data,
      lastDataChangedAt,
      lastContentFingerprint: 'layer-fingerprint',
    })

    const result = await useGameDataStore.getState().loadCatalog(config, true)

    expect(result).toEqual({ kind: 'applied', changed: false })
    expect(useGameDataStore.getState().gameData).toBe(data)
  })

  test('loadCatalog background success toggles background flag', async () => {
    loadDataFromSourceMock.mockResolvedValue(makeGameDataFixture())

    expect(await useGameDataStore.getState().loadCatalog(config, true)).toEqual({ kind: 'staged' })

    const state = useGameDataStore.getState()
    expect(state.isBackgroundRefreshing).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.loadProgress).toBeNull()
  })

  test('applying a staged refresh publishes bounded missing item text and permits exact restoration', async () => {
    const applyRefresh = async () => {
      const { loadCatalog } = useGameDataStore.getState()
      expect(await loadCatalog(config, true)).toEqual({ kind: 'staged' })
      const { candidate } = useGameDataStore.getState().pendingCatalog!
      expect(await loadCatalog(config, false, { prepared: candidate, confirmed: true })).toEqual({
        kind: 'applied',
        changed: true,
      })
    }
    const data = makeGameDataFixture()
    data.items = expandItemEntries([firePotion], [])
    loadDataFromSourceMock.mockResolvedValue(data)
    await applyRefresh()
    expect(useGameDataStore.getState().gameData?.items[0].entries).toEqual([
      '[Item rules text unavailable]',
    ])
    expect(useGameDataStore.getState().error).toBeNull()
    expect(writeGameDataCacheMock).toHaveBeenCalled()
    const restored = makeGameDataFixture()
    restored.items = [{ ...firePotion, entries: ['Restored description.'] }]
    loadDataFromSourceMock.mockResolvedValue(restored)
    writeGameDataCacheMock.mockResolvedValueOnce({
      lastDataChangedAt: '2026-01-02T00:00:00.000Z',
      contentFingerprint: 'restored',
    })
    await applyRefresh()
    expect(useGameDataStore.getState().gameData?.items[0].entries).toEqual([
      'Restored description.',
    ])
    expect(useGameDataStore.getState().gameData?.items[0].itemEntryDiagnostics).toBeUndefined()
  })

  test('loadCatalog reports resource progress during a background refresh', async () => {
    let reportProgress: ((current: number, total: number, resource: string) => void) | undefined
    let resolveLoad: ((data: GameData) => void) | undefined
    loadDataFromSourceMock.mockImplementation((_config, options) => {
      reportProgress = options?.onProgress
      return new Promise<GameData>((resolve) => {
        resolveLoad = resolve
      })
    })

    const load = useGameDataStore.getState().loadCatalog(config, true)
    await vi.waitFor(() => expect(reportProgress).toBeTypeOf('function'))

    reportProgress?.(4, 9, 'spells')

    expect(useGameDataStore.getState()).toMatchObject({
      isBackgroundRefreshing: true,
      loadProgress: { current: 4, total: 9, resource: 'spells' },
    })

    resolveLoad?.(makeGameDataFixture())
    await load

    expect(useGameDataStore.getState().loadProgress).toBeNull()
  })

  test('background refresh rejects partial data before updating cache or timestamps', async () => {
    const existing = makeGameDataFixture()
    existing.classes = [{ name: 'Wizard', source: 'PHB' }] as unknown as GameData['classes']
    const lastDataChangedAt = '2026-01-01T00:00:00.000Z'
    const lastUpdateCheckAt = '2026-01-02T00:00:00.000Z'
    useGameDataStore.setState({
      gameData: existing,
      dataSourceConfig: config,
      lastDataChangedAt,
      lastUpdateCheckAt,
      cacheStatus: 'cached',
    })
    loadDataFromSourceMock.mockImplementation((_config, options) => {
      options?.onResourceFailure?.('spells/spells-phb.json', { required: true })
      return Promise.resolve(makeGameDataFixture())
    })

    const result = await useGameDataStore.getState().loadCatalog(config, true)

    const state = useGameDataStore.getState()
    expect(result.kind).toBe('rejected')
    expect(state.gameData).toBe(existing)
    expect(state.lastDataChangedAt).toBe(lastDataChangedAt)
    expect(state.lastUpdateCheckAt).toBe(lastUpdateCheckAt)
    expect(state.error).toBe('Could not load required game data. spells/spells-phb.json')
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test.each([
    false,
    true,
  ])('actual copied-feature parser failure preserves prior complete memory/cache (background=%s)', async (background) => {
    const { FiveEToolsDataLoader } = await import('@/lib/5etools/dataLoader')
    const raw = {
      class: [{ name: 'Cleric', source: 'XPHB' }],
      subclassFeature: [
        {
          name: 'Copy',
          source: 'PHB',
          className: 'Cleric',
          classSource: 'XPHB',
          subclassShortName: 'Nature',
          subclassSource: 'PHB',
          level: 3,
          _copy: {
            name: 'Missing',
            source: 'PHB',
            className: 'Cleric',
            classSource: 'PHB',
            subclassShortName: 'Nature',
            subclassSource: 'PHB',
            level: 1,
          },
        },
      ],
    }
    const loader = new FiveEToolsDataLoader(config, {
      type: 'remote',
      readJson: (file) =>
        Promise.resolve(
          file === 'class/index.json'
            ? { cleric: 'class-cleric.json' }
            : file === 'class/class-cleric.json'
              ? raw
              : {},
        ),
    })
    loadDataFromSourceMock.mockImplementation((_config, options) => loader.loadAllData(options))
    const existing = makeGameDataFixture(),
      lastDataChangedAt = '2026-01-01T00:00:00.000Z',
      lastUpdateCheckAt = '2026-01-02T00:00:00.000Z'
    useGameDataStore.setState({
      gameData: existing,
      dataSourceConfig: config,
      lastDataChangedAt,
      lastUpdateCheckAt,
      cacheStatus: 'cached',
    })
    expect((await useGameDataStore.getState().loadCatalog(config, background)).kind).toBe(
      'rejected',
    )
    const state = useGameDataStore.getState()
    expect(state.gameData).toBe(existing)
    expect(state.lastDataChangedAt).toBe(lastDataChangedAt)
    expect(state.lastUpdateCheckAt).toBe(lastUpdateCheckAt)
    expect(state.error).toBe('Could not load required game data. class/class-cleric.json')
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test('foreground load rejects required resource failures before updating cache', async () => {
    loadDataFromSourceMock.mockImplementation((_config, options) => {
      options?.onResourceFailure?.('class/class-wizard.json', { required: true })
      return Promise.resolve(makeGameDataFixture())
    })

    const result = await useGameDataStore.getState().loadCatalog(config)

    const state = useGameDataStore.getState()
    expect(result.kind).toBe('rejected')
    expect(state.gameData).toBeNull()
    expect(state.dataSourceConfig).toBeNull()
    expect(state.error).toBe('Could not load required game data. class/class-wizard.json')
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test('foreground load accepts optional presentation resource failures', async () => {
    const data = makeGameDataFixture()
    loadDataFromSourceMock.mockImplementation((_config, options) => {
      options?.onResourceFailure?.('fluff-races.json', { required: false })
      return Promise.resolve(data)
    })

    const result = await useGameDataStore.getState().loadCatalog(config)

    expect(result).toEqual({ kind: 'applied', changed: true })
    expect(useGameDataStore.getState().gameData).toBe(data)
    expect(writeGameDataCacheMock).toHaveBeenCalledTimes(1)
  })

  test('background refresh keeps existing data when loader returns empty payload', async () => {
    const existing = makeGameDataFixture()
    existing.classes = [{ name: 'Wizard', source: 'PHB' }] as unknown as GameData['classes']
    useGameDataStore.setState({
      gameData: existing,
      dataSourceConfig: config,
      cacheStatus: 'cached',
    })

    loadDataFromSourceMock.mockResolvedValue(makeGameDataFixture())

    await useGameDataStore.getState().loadCatalog(config, true)

    const state = useGameDataStore.getState()
    expect(state.gameData).toEqual(existing)
    expect(state.cacheStatus).toBe('remote-cache')
    expect(state.error).toBe('Background refresh returned empty data; keeping existing cache')
    expect(writeGameDataCacheMock).not.toHaveBeenCalled()
  })

  test('loadCatalog handles loader errors', async () => {
    loadDataFromSourceMock.mockRejectedValue(new Error('boom'))

    await useGameDataStore.getState().loadCatalog(config)

    const state = useGameDataStore.getState()
    expect(state.error).toBe('boom')
    expect(state.isLoading).toBe(false)
    expect(state.isBackgroundRefreshing).toBe(false)
  })

  test('restores the bundled source only after its data loads successfully', async () => {
    const existingData = makeGameDataFixture()
    const bundledData = makeGameDataFixture()
    bundledData.classes = [{ name: 'Wizard', source: 'PHB' }] as GameData['classes']
    const bundledConfig: DataSourceConfig = {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    }
    resolveDefaultBundledSourceMock.mockResolvedValue(bundledConfig)
    loadDataFromSourceMock.mockResolvedValue(bundledData)
    useGameDataStore.setState({ gameData: existingData, dataSourceConfig: config })

    const restored = await useGameDataStore.getState().restoreBundledData()

    expect(restored).toBe(true)
    expect(useGameDataStore.getState().gameData).toBe(bundledData)
    expect(useGameDataStore.getState().dataSourceConfig).toEqual(
      expect.objectContaining({
        type: 'bundled',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
      }),
    )
  })

  test('keeps external data and configuration when bundled restore is unavailable', async () => {
    const existingData = makeGameDataFixture()
    useGameDataStore.setState({ gameData: existingData, dataSourceConfig: config })

    const restored = await useGameDataStore.getState().restoreBundledData()

    const state = useGameDataStore.getState()
    expect(restored).toBe(false)
    expect(state.gameData).toBe(existingData)
    expect(state.dataSourceConfig).toBe(config)
    expect(state.error).toContain('Included SRD is unavailable')
    expect(loadDataFromSourceMock).not.toHaveBeenCalled()
  })

  test('keeps external data and configuration when bundled loading fails', async () => {
    const existingData = makeGameDataFixture()
    const bundledConfig: DataSourceConfig = {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    }
    resolveDefaultBundledSourceMock.mockResolvedValue(bundledConfig)
    loadDataFromSourceMock.mockRejectedValue(new Error('bundled files are damaged'))
    useGameDataStore.setState({ gameData: existingData, dataSourceConfig: config })

    const restored = await useGameDataStore.getState().restoreBundledData()

    const state = useGameDataStore.getState()
    expect(restored).toBe(false)
    expect(state.gameData).toBe(existingData)
    expect(state.dataSourceConfig).toBe(config)
    expect(state.error).toBe('bundled files are damaged')
  })

  test('persist partialize keeps only config and timestamp fields', () => {
    const storeWithPersist = useGameDataStore as unknown as {
      persist: {
        getOptions: () => {
          partialize: (state: ReturnType<typeof useGameDataStore.getState>) => {
            dataSourceConfig: DataSourceConfig | null
          }
        }
      }
    }

    const partialize = storeWithPersist.persist.getOptions().partialize
    const partialized = partialize({
      ...useGameDataStore.getState(),
      gameData: makeGameDataFixture(),
      dataSourceConfig: config,
      lastDataChangedAt: null,
      lastContentFingerprint: null,
      lastUpdateCheckAt: null,
    })

    expect(partialized).toEqual({
      dataSourceConfig: config,
      lastDataChangedAt: null,
      lastContentFingerprint: null,
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
})
