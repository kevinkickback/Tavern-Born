import { delMany, get, setMany } from 'idb-keyval'
import { describe, expect, test, vi } from 'vitest'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { migrateGameDataPersistedState, useGameDataStore } from '@/store/gameDataStore'

vi.unmock('@/lib/storage/idb-storage')

const { bundledSource, prepareCatalog } = vi.hoisted(() => ({
  bundledSource: {
    type: 'bundled',
    path: 'srd/core',
    packId: 'tavern-born-srd-core',
    packVersion: '2.0.0',
    isValid: true,
  },
  prepareCatalog: vi.fn(() => Promise.reject(new Error('The configured source is unavailable'))),
}))

vi.mock('@/lib/5etools/bundledSource', () => ({
  resolveDefaultBundledSource: async () => bundledSource,
}))

vi.mock('@/lib/5etools/catalogCandidate', () => ({ prepareCatalog }))

vi.mock('@/lib/5etools/dataLoader', () => ({
  loadDataFromSource: async () => ({
    ...createEmptyGameData(),
    spells: [{ name: 'Light', source: 'PHB', level: 0 }],
  }),
}))

describe('game data source persistence migration', () => {
  test.each([
    { type: 'local', path: 'C:\\5etools\\data' },
    { type: 'remote', path: 'https://github.com/example/5etools/tree/main' },
  ])('retains a released v0.6.0 $type location when its parsed cache is rejected', async (source) => {
    const store = useGameDataStore
    const settingsKey = 'game-data-storage'
    const cacheKey = 'tb:game-data-cache'
    const loaded = '2026-09-19T00:00:00.000Z'
    const config = {
      ...source,
      isValid: true,
      lastLoaded: loaded,
      availableResources: ['spells/index.json'],
    }
    // Version-1 settings and cache format 15 as written by the v0.6.0 tag.
    const legacySettings = {
      version: 1,
      state: {
        dataSourceConfig: config,
        lastLoadedAt: loaded,
        lastDataChangedAt: loaded,
        lastContentFingerprint: 'legacy-fingerprint',
        lastUpdateCheckAt: loaded,
      },
    }
    const legacyCache = {
      cacheSchemaVersion: 15,
      data: { ...createEmptyGameData(), spells: [{ name: 'Old cached spell', level: 0 }] },
      cachedAt: loaded,
      sourceSnapshot: { ...source, resources: config.availableResources },
    }

    await setMany([
      [settingsKey, legacySettings],
      [cacheKey, legacyCache],
    ])
    try {
      await store.persist.rehydrate()
      expect(store.getState().dataSourceConfig).toEqual(config)
      const { backgroundRefresh } = await store.getState().loadFromCache({ checkForUpdates: true })
      expect(backgroundRefresh).toBeDefined()
      await expect(backgroundRefresh).resolves.toBe(false)
      expect(prepareCatalog).toHaveBeenLastCalledWith(
        config,
        bundledSource,
        expect.any(AbortSignal),
        expect.any(Function),
      )
      expect(store.getState().gameData?.spells.map(({ name }) => name)).toEqual(['Light'])
      expect(store.getState().dataSourceConfig).toEqual(config)
      expect(store.getState().sessionBundledSource).toEqual(bundledSource)
      expect(await get(settingsKey)).toEqual(legacySettings)
      expect(await get(cacheKey)).toEqual(legacyCache)
    } finally {
      store.setState(store.getInitialState())
      await delMany([settingsKey, cacheKey])
    }
  })

  test('preserves legacy local and remote source configurations', () => {
    const localState = {
      dataSourceConfig: { type: 'local', path: 'C:\\5etools\\data', isValid: true },
    }
    const remoteState = {
      dataSourceConfig: { type: 'remote', path: 'https://example.com/5etools', isValid: true },
    }

    expect(migrateGameDataPersistedState(localState)).toBe(localState)
    expect(migrateGameDataPersistedState(remoteState)).toBe(remoteState)
  })

  test('preserves valid external resource inventories', () => {
    const state = {
      dataSourceConfig: {
        type: 'remote',
        path: 'https://example.com/5etools',
        isValid: true,
        availableResources: ['feats.json', 'class/index.json'],
      },
    }

    expect(migrateGameDataPersistedState(state)).toBe(state)
  })

  test('preserves bundled sources only when stable pack identity is present', () => {
    const bundledState = {
      dataSourceConfig: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        isValid: true,
      },
    }

    expect(migrateGameDataPersistedState(bundledState)).toBe(bundledState)
    expect(
      migrateGameDataPersistedState({
        dataSourceConfig: { type: 'bundled', path: 'srd/core', isValid: true },
      }),
    ).toEqual({ dataSourceConfig: null })
  })

  test('drops malformed source configurations without disturbing other persisted fields', () => {
    expect(
      migrateGameDataPersistedState({
        dataSourceConfig: { type: 'local', path: 42, isValid: true },
        lastLoadedAt: '2026-09-19T00:00:00.000Z',
      }),
    ).toEqual({
      dataSourceConfig: null,
      lastLoadedAt: '2026-09-19T00:00:00.000Z',
    })
  })

  test.each([
    42,
    null,
    ['feats.json', 42],
  ])('drops malformed external resource inventory %j', (availableResources) => {
    expect(
      migrateGameDataPersistedState({
        dataSourceConfig: {
          type: 'remote',
          path: 'https://example.com/5etools',
          isValid: true,
          availableResources,
        },
        lastLoadedAt: '2026-09-19T00:00:00.000Z',
      }),
    ).toEqual({
      dataSourceConfig: null,
      lastLoadedAt: '2026-09-19T00:00:00.000Z',
    })
  })
})
