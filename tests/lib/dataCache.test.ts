import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { parseItems, parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { filterSpellRouteSources } from '@/lib/5etools/spellRouteSources'
import type { DataSourceConfig, GameData, GameDataSourceStack } from '@/types/5etools'

const { idbGetMock } = vi.hoisted(() => ({
  idbGetMock: vi.fn<() => Promise<unknown>>(async () => null),
}))

vi.mock('idb-keyval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('idb-keyval')>()),
  get: idbGetMock,
  del: vi.fn(async () => undefined),
}))

import {
  cacheMetadata,
  clearGameDataCache,
  computeGameDataFingerprint,
  GAME_DATA_CACHE_SCHEMA_VERSION,
  isCacheForSource,
  markCatalogChecked,
  persistCatalogRepair,
  readGameDataCache,
  readGameDataCachePair,
  writeCatalogRefreshCheck,
  writeGameDataCache,
} from '@/lib/storage/dataCache'

function makeGameData(seed = 'a'): GameData {
  return {
    races: [{ name: seed } as never],
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

const config: DataSourceConfig = { type: 'remote', path: 'https://example.com', isValid: true }

describe('writeGameDataCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    idbGetMock.mockResolvedValue(null)
  })

  afterEach(() => vi.useRealTimers())

  test('stores the refresh outcome independently from the accepted catalog and settings', async () => {
    const check = {
      source: config,
      lastAttemptAt: Date.parse('2026-11-01T05:00:00Z'),
      lastSuccessAt: null,
      consecutiveFailures: 2,
    }
    const entry = await writeGameDataCache(makeGameData(), config, { config })
    try {
      await writeCatalogRefreshCheck(check)
      const pair = await readGameDataCachePair()
      expect(pair.cache).toEqual(entry)
      expect(pair.settings).toMatchObject({ dataSourceConfig: config })
      expect(pair.refreshCheck).toEqual(check)
      await clearGameDataCache()
      expect((await readGameDataCachePair()).refreshCheck).toEqual(check)
      await writeGameDataCache(makeGameData('accepted'), config, { config })
      expect((await readGameDataCachePair()).refreshCheck).toBeUndefined()
      await writeCatalogRefreshCheck(check)
    } finally {
      await clearGameDataCache(true)
    }
    expect((await readGameDataCachePair()).refreshCheck).toBeUndefined()
  })

  test('updates check metadata without rewriting the catalog and rejects writes after clear', async () => {
    const source = { ...config, acceptedRevision: '1'.repeat(40) }
    const verified = { ...source, acceptedRevision: '2'.repeat(40) }
    const checkedAt = '2026-10-01T00:00:00.000Z'
    const signal = new AbortController().signal
    const entry = await writeGameDataCache(makeGameData(), source, { config: source })
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    try {
      await expect(
        markCatalogChecked(cacheMetadata(entry), verified, checkedAt, signal),
      ).resolves.toBe(entry.generation)
      expect(put.mock.calls.map(([, key]) => key)).toEqual(['game-data-storage'])
      const pair = await readGameDataCachePair()
      expect(pair.cache).toEqual(entry)
      expect(pair.settings).toMatchObject({
        dataSourceConfig: verified,
        lastUpdateCheckAt: checkedAt,
      })
      await clearGameDataCache(true)
      await expect(
        markCatalogChecked(cacheMetadata(entry), verified, checkedAt, signal),
      ).resolves.toBeUndefined()
      await expect(persistCatalogRepair(entry, entry, signal)).resolves.toBeNull()
      expect(await readGameDataCachePair()).toEqual({ cache: null, settings: undefined })
    } finally {
      put.mockRestore()
      await clearGameDataCache(true)
    }
  })

  test('adopts a pre-worker cache once without rewriting its catalog', async () => {
    const idb = await vi.importActual<typeof import('idb-keyval')>('idb-keyval')
    const cacheKey = 'tb:game-data-cache'
    const generationKey = 'tb:game-data-cache-generation'
    const signal = new AbortController().signal
    const entry = await writeGameDataCache(makeGameData(), config, { config })
    const { generation: _generation, ...legacy } = entry
    await idb.set(cacheKey, legacy)
    await idb.del(generationKey)
    const get = vi.spyOn(IDBObjectStore.prototype, 'get')
    try {
      const stamp = await markCatalogChecked(legacy, config, entry.cachedAt, signal)
      expect(stamp).toEqual(expect.any(String))
      expect(get.mock.calls.map(([key]) => key)).toEqual([generationKey, cacheKey])
      expect(await idb.get(cacheKey)).toEqual(legacy)
      const { cache } = await readGameDataCachePair()
      expect(cache?.generation).toBe(stamp)
      get.mockClear()
      await expect(
        markCatalogChecked(cacheMetadata(cache!), config, entry.cachedAt, signal),
      ).resolves.toBe(stamp)
      expect(get.mock.calls.map(([key]) => key)).toEqual([generationKey])
    } finally {
      get.mockRestore()
      await clearGameDataCache(true)
    }
  })

  test('aborting the pre-write cache read releases the writer without committing', async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    let finishRead: (value: unknown) => void = () => {}
    const pendingRead = new Promise((resolve) => {
      finishRead = resolve
    })
    idbGetMock.mockReturnValueOnce(pendingRead)
    const attempt = new AbortController()
    const writing = writeGameDataCache(makeGameData(), config, {
      signal: attempt.signal,
    })
    attempt.abort(new Error('Startup deadline'))
    await expect(writing).rejects.toThrow('Startup deadline')
    try {
      expect(put).not.toHaveBeenCalled()
      finishRead(null)
      const next = await writeGameDataCache(makeGameData('next'), config)
      expect(put).toHaveBeenCalledWith(next, 'tb:game-data-cache')
    } finally {
      put.mockRestore()
      await clearGameDataCache()
    }
  })

  test('aborting a queued IndexedDB transaction prevents the catalog from being written', async () => {
    const idb = await vi.importActual<typeof import('idb-keyval')>('idb-keyval')
    const useStore = idb.createStore('keyval-store', 'keyval')
    const blocker = await useStore('readwrite', (store) => {
      const keepOpen = () => {
        store.get('lock').onsuccess = keepOpen
      }
      keepOpen()
      return store.transaction
    })
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    try {
      const attempt = new AbortController()
      const writing = writeGameDataCache(makeGameData(), config, { signal: attempt.signal })
      await vi.waitFor(() => expect(put).toHaveBeenCalled())
      attempt.abort(new Error('Startup deadline'))
      await expect(writing).rejects.toThrow('Startup deadline')
    } finally {
      blocker.abort()
      put.mockRestore()
    }
    expect(await idb.get('tb:game-data-cache')).toBeUndefined()
  })

  test('a committed catalog is reported as written when the deadline races its completion event', async () => {
    const idb = await vi.importActual<typeof import('idb-keyval')>('idb-keyval')
    const attempt = new AbortController()
    const originalPut = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      this.transaction.addEventListener('complete', () => attempt.abort(), { capture: true })
      return originalPut.call(this, value, key)
    })
    try {
      const entry = await writeGameDataCache(makeGameData(), config, { signal: attempt.signal })
      expect(attempt.signal.aborted).toBe(true)
      expect(await idb.get('tb:game-data-cache')).toEqual(entry)
    } finally {
      put.mockRestore()
      await idb.del('tb:game-data-cache')
    }
  })

  test('a superseded activation keeps the accepted configuration and catalog together', async () => {
    const idb = await vi.importActual<typeof import('idb-keyval')>('idb-keyval')
    const old = await writeGameDataCache(makeGameData('Accepted'), config, { config })
    const check = {
      source: config,
      lastAttemptAt: Date.now(),
      lastSuccessAt: Date.now(),
      consecutiveFailures: 0,
      needsReview: true,
    }
    await writeCatalogRefreshCheck(check)
    const next = { ...config, path: 'https://backup.example.test' }
    const controller = new AbortController()
    const originalPut = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    put.mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = originalPut.call(this, value, key)
      if (key === 'game-data-storage') controller.abort(new Error('Superseded'))
      return request
    })
    try {
      await expect(
        writeGameDataCache(makeGameData('Candidate'), next, {
          config: next,
          signal: controller.signal,
        }),
      ).rejects.toThrow('Superseded')
      expect(await idb.get('tb:game-data-cache')).toEqual(old)
      expect(await idb.get('game-data-storage')).toMatchObject({
        state: { dataSourceConfig: config },
      })
      expect((await readGameDataCachePair()).refreshCheck).toEqual(check)
    } finally {
      put.mockRestore()
      await clearGameDataCache(true)
    }
  })

  test('reads the catalog and accepted revision from one storage snapshot', async () => {
    const idb = await vi.importActual<typeof import('idb-keyval')>('idb-keyval')
    try {
      for (const acceptedRevision of ['1'.repeat(40), '2'.repeat(40)]) {
        const source = { ...config, acceptedRevision }
        await writeGameDataCache(makeGameData(acceptedRevision), source, { config: source })
        const { cache, settings } = await readGameDataCachePair()
        expect(settings?.dataSourceConfig).toEqual(source)
        expect(cache?.data.races[0].name).toBe(acceptedRevision)
      }
    } finally {
      await idb.delMany(['tb:game-data-cache', 'game-data-storage'])
    }
  })

  test('retains named target ambiguity through cache and permits an exact unique winning overlay', async () => {
    const weapon = { name: 'Example weapon', source: 'TEST', type: 'M' }
    const option = { name: 'Example option', source: 'TEST', featureType: ['TEST'] }
    const base = {
      ...makeGameData(),
      itemsBase: parseItems({ baseitem: [weapon, weapon] }) as GameData['itemsBase'],
      optionalfeatures: parseOptionalFeatures({ optionalfeature: [option, option] }),
    }
    const composed = composeGameDataLayers([base])
    const entry = await writeGameDataCache(composed, config)
    idbGetMock.mockResolvedValue(JSON.parse(JSON.stringify(entry)))
    const cached = (await readGameDataCache())!.data
    for (const rows of [cached.itemsBase, cached.optionalfeatures]) {
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ sourceIdentityConflict: true })
    }
    const restored = composeGameDataLayers([
      cached,
      {
        ...makeGameData(),
        itemsBase: parseItems({ baseitem: [weapon] }) as GameData['itemsBase'],
        optionalfeatures: parseOptionalFeatures({ optionalfeature: [option] }),
      },
    ])
    for (const rows of [restored.itemsBase, restored.optionalfeatures]) {
      expect(rows).toHaveLength(1)
      expect(rows[0]).not.toHaveProperty('sourceIdentityConflict', true)
    }
  })

  test('current cache retains route witnesses and invalidates the previous normalization', async () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/spellRouteSources.json', 'utf8'))
    const data = makeGameData()
    data.spells = parseSpells([fixture.spell[0], fixture.spell[0]], {
      sourceLookup: fixture.lookup,
      origin: 'cache-fixture',
    }) as GameData['spells']
    const before = computeGameDataFingerprint(data)
    const entry = await writeGameDataCache(data, config)
    expect(entry.cacheSchemaVersion).toBe(GAME_DATA_CACHE_SCHEMA_VERSION)
    idbGetMock.mockResolvedValue(JSON.parse(JSON.stringify(entry)))
    const cached = (await readGameDataCache())!
    expect(filterSpellRouteSources(cached.data.spells[0], ['PHB', 'TCE']).classSpellRoutes).toEqual(
      [],
    )
    expect(cached.data.spells[0].classSpellRouteSource!.input.targetOccurrences).toHaveLength(2)
    data.spells = parseSpells([fixture.spell[0]], {
      sourceLookup: fixture.lookup,
      origin: 'cache-fixture',
    }) as GameData['spells']
    expect(computeGameDataFingerprint(data)).not.toBe(before)
    idbGetMock.mockResolvedValue({
      ...entry,
      cacheSchemaVersion: GAME_DATA_CACHE_SCHEMA_VERSION - 1,
    })
    await expect(readGameDataCache()).resolves.toBeNull()
  })

  test.skipIf(!existsSync('data/class/class-mystic.json'))(
    'retains audited Mystic parent and subclass conflicts through parsed cache roundtrip',
    async () => {
      const raw = JSON.parse(readFileSync('data/class/class-mystic.json', 'utf8'))
      const data = makeGameData()
      for (const document of [
        { ...raw, class: [raw.class[0], raw.class[0]] },
        { ...raw, subclass: [raw.subclass[0], raw.subclass[0]] },
      ]) {
        data.classes = parseClassDocument(document).classes as GameData['classes']
        const entry = await writeGameDataCache(data, config)
        idbGetMock.mockResolvedValue(JSON.parse(JSON.stringify(entry)))
        const cached = (await readGameDataCache())!.data.classes
        expect(
          cached.every((row) => row.subclasses!.every((sub) => sub.sourceIdentityConflict)),
        ).toBe(true)
        expect(cached.every((row) => row.sourceIdentityConflict)).toBe(document.class.length > 1)
      }
    },
  )

  test('preserves the established JSON hash while ignoring runtime lookups', () => {
    const data = makeGameData('fingerprint')
    const fingerprint = computeGameDataFingerprint(data)
    data.lookups = { classes: new Map([['ignored', {} as never]]) } as never

    expect(computeGameDataFingerprint(data)).toBe(fingerprint)
    data.races.push({ name: 'Different', source: 'TEST' } as never)
    expect(computeGameDataFingerprint(data)).not.toBe(fingerprint)
  })

  test('sets lastDataChangedAt to now on first write (no previous cache, no fallback)', async () => {
    const before = Date.now()
    const entry = await writeGameDataCache(makeGameData(), config)
    const after = Date.now()

    expect(entry.lastDataChangedAt).toBeDefined()
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeLessThanOrEqual(after)
    expect(entry.cacheSchemaVersion).toBe(GAME_DATA_CACHE_SCHEMA_VERSION)
  })

  test('invalidates cache entries produced by an older normalization schema', async () => {
    idbGetMock.mockResolvedValue({
      data: makeGameData(),
      cachedAt: new Date().toISOString(),
      sourceSnapshot: { type: config.type, path: config.path },
    })

    await expect(readGameDataCache()).resolves.toBeNull()
  })

  test.each([
    15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 37, 38, 39,
  ])('rejects catalogs predating current normalization: %s', async (schema) => {
    idbGetMock.mockResolvedValue({
      data: makeGameData(),
      cacheSchemaVersion: schema,
      cachedAt: new Date().toISOString(),
      sourceSnapshot: { type: config.type, path: config.path },
    })
    await expect(readGameDataCache()).resolves.toBeNull()
  })

  test('preserves lastDataChangedAt when fingerprint matches existing cache', async () => {
    const data = makeGameData()
    const first = await writeGameDataCache(data, config)
    const lastDataChangedAt = '2025-01-01T00:00:00.000Z'

    idbGetMock.mockResolvedValue({ ...first, lastDataChangedAt })
    const second = await writeGameDataCache(data, config, {
      fingerprint: first.contentFingerprint,
      lastDataChangedAt: '2025-02-01T00:00:00.000Z',
    })

    expect(second.lastDataChangedAt).toBe(lastDataChangedAt)
  })

  test('updates lastDataChangedAt when content actually changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const first = await writeGameDataCache(makeGameData('a'), config)

    idbGetMock.mockResolvedValue({
      ...first,
      sourceSnapshot: { type: config.type, path: config.path },
    })

    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))

    const second = await writeGameDataCache(makeGameData('b'), config)

    expect(second.lastDataChangedAt).toBe('2026-06-01T12:00:00.000Z')
  })

  test('preserves lastDataChangedAt via fallback when cache was cleared but data unchanged', async () => {
    const data = makeGameData('x')
    const lastDataChangedAt = '2025-01-01T00:00:00.000Z'
    const entry = await writeGameDataCache(data, config, {
      fingerprint: computeGameDataFingerprint(data),
      lastDataChangedAt,
    })

    expect(entry.lastDataChangedAt).toBe(lastDataChangedAt)
  })

  test('ignores fallback when fingerprints differ (data actually changed)', async () => {
    const dataA = makeGameData('a')
    const dataB = makeGameData('b')

    const firstA = await writeGameDataCache(dataA, config)

    idbGetMock.mockResolvedValue(null)

    const before = Date.now()
    const entry = await writeGameDataCache(dataB, config, {
      fingerprint: firstA.contentFingerprint,
      lastDataChangedAt: firstA.lastDataChangedAt,
    })
    const after = Date.now()

    expect(entry.lastDataChangedAt).toBeDefined()
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeLessThanOrEqual(after)
  })

  test('ignores fallback when lastDataChangedAt is null', async () => {
    const data = makeGameData('x')
    const first = await writeGameDataCache(data, config)

    idbGetMock.mockResolvedValue(null)

    const before = Date.now()
    const entry = await writeGameDataCache(data, config, {
      fingerprint: first.contentFingerprint,
      lastDataChangedAt: null,
    })
    const after = Date.now()

    expect(entry.lastDataChangedAt).toBeDefined()
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(entry.lastDataChangedAt!).getTime()).toBeLessThanOrEqual(after)
  })

  test('uses the matching cache write date when its fingerprint and change date are missing', async () => {
    const data = makeGameData('y')
    const first = await writeGameDataCache(data, config)
    const cachedAt = '2025-01-01T00:00:00.000Z'

    idbGetMock.mockResolvedValue({
      ...first,
      cachedAt,
      contentFingerprint: undefined,
      lastDataChangedAt: undefined,
    })
    const second = await writeGameDataCache(data, config, {
      fingerprint: first.contentFingerprint,
      lastDataChangedAt: '2025-02-01T00:00:00.000Z',
    })

    expect(second.lastDataChangedAt).toBe(cachedAt)
  })

  test('uses the current write date for identical content from a different source', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    const data = makeGameData()
    const first = await writeGameDataCache(data, config)
    idbGetMock.mockResolvedValue(first)

    const now = '2026-01-01T00:00:00.000Z'
    vi.setSystemTime(new Date(now))
    const second = await writeGameDataCache(
      data,
      { ...config, path: 'https://other.example' },
      {
        fingerprint: first.contentFingerprint,
        lastDataChangedAt: first.lastDataChangedAt,
      },
    )

    expect(second.lastDataChangedAt).toBe(now)
  })

  test('does not reuse timestamps from an obsolete cache schema without a fallback', async () => {
    const data = makeGameData('legacy')
    const before = '2025-01-01T00:00:00.000Z'

    idbGetMock.mockResolvedValue({
      data,
      cachedAt: before,
      lastDataChangedAt: before,
      sourceSnapshot: { type: config.type, path: config.path },
    })

    const entry = await writeGameDataCache(data, config)

    expect(entry.lastDataChangedAt).not.toBe(before)
    expect(entry.cacheSchemaVersion).toBe(GAME_DATA_CACHE_SCHEMA_VERSION)
  })
})

describe('isCacheForSource', () => {
  test('includes bundled pack identity and version in cache matching', () => {
    const bundled: DataSourceConfig = {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    }
    const entry = {
      data: makeGameData(),
      cacheSchemaVersion: GAME_DATA_CACHE_SCHEMA_VERSION,
      cachedAt: new Date().toISOString(),
      sourceSnapshot: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
      },
    }

    expect(isCacheForSource(entry, bundled)).toBe(true)
    expect(isCacheForSource(entry, { ...bundled, packVersion: '1.0.1' })).toBe(false)
  })

  test('keys a layered cache by both the Included SRD and additional source', async () => {
    const stack: GameDataSourceStack = {
      base: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
      additional: { ...config, availableResources: ['feats.json'] },
    }

    const entry = await writeGameDataCache(makeGameData(), stack, {
      layerMetadata: {
        base: { contentFingerprint: 'base-fingerprint', entityCount: 42 },
        additional: { contentFingerprint: 'additional-fingerprint', entityCount: 7 },
      },
    })

    expect(entry.sourceSnapshot.layers).toHaveLength(2)
    expect(entry.sourceSnapshot.layers).toEqual([
      expect.objectContaining({
        role: 'base',
        contentFingerprint: 'base-fingerprint',
        entityCount: 42,
      }),
      expect.objectContaining({
        role: 'additional',
        contentFingerprint: 'additional-fingerprint',
        entityCount: 7,
      }),
    ])
    expect(isCacheForSource(entry, stack)).toBe(true)
    expect(
      isCacheForSource(entry, {
        ...stack,
        base: { ...stack.base, packVersion: '1.0.1' },
      }),
    ).toBe(false)
    expect(isCacheForSource(entry, config)).toBe(false)
    expect(
      isCacheForSource(entry, {
        ...stack,
        additional: { ...config, availableResources: ['class/index.json'] },
      }),
    ).toBe(false)
  })
})
