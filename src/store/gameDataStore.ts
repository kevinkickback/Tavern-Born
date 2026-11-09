import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveDefaultBundledSource } from '@/lib/5etools/bundledSource'
import {
  type DataSourceStackLoaderOptions,
  loadGameDataSourceStack,
} from '@/lib/5etools/contentLayers'
import { loadDataFromSource } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { settleOnAbort } from '@/lib/abortable'
import {
  clearGameDataCache,
  computeGameDataFingerprint,
  type GameDataLayerCacheMetadataByRole,
  isCacheForSource,
  isCacheStale,
  readGameDataCache,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import type {
  BundledDataSourceConfig,
  DataSourceConfig,
  GameData,
  GameDataSourceStack,
} from '@/types/5etools'

let activeLoadController: AbortController | null = null
let activeLoadRequestId = 0
let remoteStartupPreparation: AbortController | null = null
let remoteStartupAttempt: AbortController | null = null
let cacheMutationQueue: Promise<void> = Promise.resolve()

const GAME_DATA_STORE_VERSION = 1
export const REMOTE_STARTUP_TIMEOUT_MS = 15_000
const remoteTimeout = () =>
  new DOMException('The game data source did not respond within 15 seconds.', 'TimeoutError')

function cancelRemoteStartup() {
  remoteStartupAttempt?.abort()
  remoteStartupAttempt = null
  remoteStartupPreparation?.abort()
  remoteStartupPreparation = null
}

type RemoteStartupStatus =
  | 'checking'
  | 'committing'
  | 'unavailable'
  | 'cached'
  | 'loaded'
  | 'loading-srd'
  | 'srd'
  | 'setup'

interface StartupLoad {
  signal: AbortSignal
  beginCommit: () => void
  sourceStack?: GameDataSourceStack | null
}

export function migrateGameDataPersistedState(persistedState: unknown): unknown {
  if (!persistedState || typeof persistedState !== 'object' || Array.isArray(persistedState)) {
    return persistedState
  }
  const state = persistedState as Record<string, unknown>
  const config = state.dataSourceConfig
  if (config == null) return state
  if (typeof config !== 'object' || Array.isArray(config)) {
    return { ...state, dataSourceConfig: null }
  }

  const candidate = config as Record<string, unknown>
  const hasBaseFields =
    typeof candidate.path === 'string' &&
    typeof candidate.isValid === 'boolean' &&
    (candidate.type === 'local' || candidate.type === 'remote' || candidate.type === 'bundled')
  const hasBundledIdentity =
    candidate.type !== 'bundled' ||
    (typeof candidate.packId === 'string' &&
      candidate.packId.length > 0 &&
      typeof candidate.packVersion === 'string' &&
      candidate.packVersion.length > 0)
  const hasValidAvailableResources =
    candidate.type === 'bundled' ||
    candidate.availableResources === undefined ||
    (Array.isArray(candidate.availableResources) &&
      candidate.availableResources.every((resource) => typeof resource === 'string'))

  return hasBaseFields && hasBundledIdentity && hasValidAvailableResources
    ? state
    : { ...state, dataSourceConfig: null }
}

function enqueueCacheMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = cacheMutationQueue.then(mutation)
  cacheMutationQueue = operation.then(
    () => undefined,
    () => undefined,
  )
  return operation
}

function getCatalogEntityCount(data: GameData): number {
  return (
    data.races.length +
    data.classes.length +
    data.backgrounds.length +
    data.spells.length +
    data.feats.length +
    data.items.length +
    data.itemsBase.length +
    data.classFeatures.length +
    (data.creatures?.length ?? 0) +
    data.actions.length +
    data.conditions.length +
    data.deities.length +
    data.skills.length +
    data.senses.length +
    data.languages.length +
    data.optionalfeatures.length +
    data.variantrules.length +
    data.trapHazards.length +
    data.rewards.length +
    data.cultsBoons.length +
    data.organizations.length
  )
}

interface LoadProgress {
  current: number
  total: number
  resource: string
}

async function resolveSourceStack(config: DataSourceConfig): Promise<GameDataSourceStack | null> {
  if (config.type === 'bundled') return null
  const bundled = await resolveDefaultBundledSource()
  return bundled ? { base: bundled, additional: config } : null
}

/** How the current gameData was sourced this session. */
export type CacheStatus =
  | 'unknown' // initial, before hydration
  | 'fresh' // loaded from cache, within 24 h, same source
  | 'stale' // loaded from cache, being refreshed in background
  | 'offline' // loaded from cache, no source configured
  | 'remote-cache' // matching remote cache retained after a failed or timed-out startup check
  | 'session-srd' // Included SRD loaded into memory only
  | 'fetched' // freshly fetched from source this session
  | 'unconfigured' // no cache and no source — user must configure

interface GameDataState {
  gameData: GameData | null
  dataSourceConfig: DataSourceConfig | null
  isLoading: boolean
  isBackgroundRefreshing: boolean
  loadProgress: LoadProgress | null
  error: string | null
  lastLoadedAt: string | null
  lastDataChangedAt: string | null
  /** FNV-1a hash of the last successfully loaded game data; survives cache clears. */
  lastContentFingerprint: string | null
  lastUpdateCheckAt: string | null
  cacheStatus: CacheStatus
  remoteStartup: RemoteStartupStatus | null
  sessionBundledSource: BundledDataSourceConfig | null
  /** True once the Zustand persist middleware has read back from IDB. */
  hasHydrated: boolean

  setGameData: (data: GameData) => void
  setCacheStatus: (status: CacheStatus) => void
  setDataSourceConfig: (config: DataSourceConfig) => void
  setLoading: (loading: boolean) => void
  setLoadProgress: (progress: LoadProgress | null) => void
  setError: (error: string | null) => void
  setLastDataChangedAt: (iso: string | null) => void
  setLastContentFingerprint: (fp: string | null) => void
  setHasHydrated: (v: boolean) => void

  /**
   * Read from IDB cache and populate store state. Returns UI-facing outcome
   * hints while keeping notification libraries out of the store.
   *
   * Pass `forceCheck: true` to skip the 1-hour background-verify interval and
   * always fire a background source check (used by auto-refresh on launch).
   */
  loadFromCache: (opts?: {
    forceCheck?: boolean
  }) => Promise<{ needsToast?: 'offline'; backgroundRefresh?: Promise<boolean> }>

  /**
   * Fetch data from `config`, write to IDB cache, and update the store. Resolves
   * true only when the content fingerprint changed. Pass `background = true`
   * to refresh without blocking or clearing the current data.
   */
  loadGameData: (
    config: DataSourceConfig,
    background?: boolean,
    startup?: StartupLoad,
  ) => Promise<boolean>
  checkRemoteStartup: (
    deadline?: number,
    sourceStack?: GameDataSourceStack | null,
  ) => Promise<boolean>
  loadStartupSrd: () => Promise<void>
  reconfigureRemoteStartup: () => void
  refreshGameData: () => Promise<void>
  restoreBundledData: () => Promise<boolean>
  clearGameData: () => Promise<void>
}

export const useGameDataStore = create<GameDataState>()(
  persist(
    (set, get) => ({
      gameData: null,
      dataSourceConfig: null,
      isLoading: false,
      isBackgroundRefreshing: false,
      loadProgress: null,
      error: null,
      lastLoadedAt: null,
      lastDataChangedAt: null,
      lastContentFingerprint: null,
      lastUpdateCheckAt: null,
      cacheStatus: 'unknown',
      remoteStartup: null,
      sessionBundledSource: null,
      hasHydrated: false,

      setGameData: (data) =>
        set({
          gameData: data.lookups ? data : { ...data, lookups: buildGameDataLookups(data) },
        }),
      setCacheStatus: (status) => set({ cacheStatus: status }),
      setDataSourceConfig: (config) => set({ dataSourceConfig: config }),
      setLoading: (loading) => set({ isLoading: loading }),
      setLoadProgress: (progress) => set({ loadProgress: progress }),
      setError: (error) => set({ error }),
      setLastDataChangedAt: (iso) => set({ lastDataChangedAt: iso }),
      setLastContentFingerprint: (fp) => set({ lastContentFingerprint: fp }),
      setHasHydrated: (v) => set({ hasHydrated: v }),

      loadFromCache: async (opts) => {
        const {
          dataSourceConfig: savedSourceConfig,
          lastUpdateCheckAt,
          loadGameData,
          setGameData,
          setCacheStatus,
          setLastDataChangedAt,
          setLastContentFingerprint,
        } = get()
        const remoteDeadline =
          savedSourceConfig?.type === 'remote'
            ? performance.now() + REMOTE_STARTUP_TIMEOUT_MS
            : undefined
        if (remoteDeadline !== undefined && (remoteStartupPreparation || remoteStartupAttempt))
          return {}
        const cacheRead = readGameDataCache()
        // The installed pack can change with an app update. Compare against its
        // current manifest, not the version remembered by the previous installation.
        const dataSourceConfig =
          savedSourceConfig?.type === 'bundled'
            ? ((await resolveDefaultBundledSource()) ?? savedSourceConfig)
            : savedSourceConfig
        const stack = dataSourceConfig ? resolveSourceStack(dataSourceConfig) : null
        const controller = remoteDeadline === undefined ? undefined : new AbortController()
        if (controller) remoteStartupPreparation = controller
        const preflight = Promise.all([
          cacheRead.then((cache) => {
            if (
              !cache &&
              controller &&
              remoteStartupPreparation === controller &&
              get().dataSourceConfig === savedSourceConfig
            ) {
              set({ remoteStartup: 'checking', error: null })
            }
            return cache
          }),
          stack,
        ])
        const timer =
          controller &&
          setTimeout(() => controller.abort(remoteTimeout()), REMOTE_STARTUP_TIMEOUT_MS)
        let resolved: Awaited<typeof preflight>
        try {
          resolved = await (controller ? settleOnAbort(preflight, controller.signal) : preflight)
        } catch (error) {
          if (!controller) throw error
          if (
            remoteStartupPreparation === controller &&
            get().dataSourceConfig === savedSourceConfig
          ) {
            clearTimeout(timer)
            await get().loadStartupSrd()
          }
          return {}
        } finally {
          clearTimeout(timer)
          if (remoteStartupPreparation === controller) remoteStartupPreparation = null
        }
        if (
          controller &&
          (controller.signal.aborted || get().dataSourceConfig !== savedSourceConfig)
        )
          return {}
        const [cache, configuredStack] = resolved
        const cacheIdentity = configuredStack ?? dataSourceConfig

        if (!cache && !dataSourceConfig) {
          const bundledSource = await resolveDefaultBundledSource()
          if (bundledSource) {
            await loadGameData(bundledSource)
            return {}
          }
          setCacheStatus('unconfigured')
          return {}
        }

        if (cache && dataSourceConfig) {
          if (!cacheIdentity || !isCacheForSource(cache, cacheIdentity)) {
            if (dataSourceConfig.type === 'remote') {
              return {
                backgroundRefresh: get().checkRemoteStartup(remoteDeadline, configuredStack),
              }
            }
            await loadGameData(dataSourceConfig)
            return {}
          }
          if (dataSourceConfig.type !== 'bundled' && isCacheStale(cache.cachedAt)) {
            setGameData(cache.data)
            setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
            setLastContentFingerprint(cache.contentFingerprint ?? null)
            setCacheStatus('stale')
            return {
              backgroundRefresh:
                dataSourceConfig.type === 'remote'
                  ? get().checkRemoteStartup(remoteDeadline, configuredStack)
                  : loadGameData(dataSourceConfig, true),
            }
          }
          setGameData(cache.data)
          setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
          setLastContentFingerprint(cache.contentFingerprint ?? null)
          setCacheStatus('fresh')
          // Only verify source in background if we haven't checked recently (within 1 hour),
          // unless forceCheck is set (e.g. auto-refresh on launch is enabled).
          const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
          const lastCheckedMs = lastUpdateCheckAt
            ? new Date(lastUpdateCheckAt).getTime()
            : Number.NaN
          const checkedRecently =
            Number.isFinite(lastCheckedMs) && Date.now() - lastCheckedMs < UPDATE_CHECK_INTERVAL_MS
          if (dataSourceConfig.type !== 'bundled' && (opts?.forceCheck || !checkedRecently)) {
            return {
              backgroundRefresh:
                dataSourceConfig.type === 'remote'
                  ? get().checkRemoteStartup(remoteDeadline, configuredStack)
                  : loadGameData(dataSourceConfig, true),
            }
          }
          return {}
        }

        if (cache && !dataSourceConfig) {
          setGameData(cache.data)
          setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
          setLastContentFingerprint(cache.contentFingerprint ?? null)
          setCacheStatus('offline')
          return { needsToast: 'offline' }
        }

        if (!cache && dataSourceConfig) {
          if (dataSourceConfig.type === 'remote') {
            return { backgroundRefresh: get().checkRemoteStartup(remoteDeadline, configuredStack) }
          }
          await loadGameData(dataSourceConfig)
          return {}
        }

        return {}
      },

      checkRemoteStartup: async (
        deadline = performance.now() + REMOTE_STARTUP_TIMEOUT_MS,
        sourceStack,
      ) => {
        const { dataSourceConfig: config, gameData, remoteStartup } = get()
        if (
          config?.type !== 'remote' ||
          remoteStartupPreparation !== null ||
          remoteStartupAttempt !== null ||
          remoteStartup === 'committing' ||
          remoteStartup === 'loading-srd'
        )
          return false
        const attempt = new AbortController()
        remoteStartupAttempt = attempt
        const timeoutError = remoteTimeout()
        const remaining = deadline - performance.now()
        const timer = setTimeout(() => attempt.abort(timeoutError), Math.max(0, remaining))
        if (remaining <= 0) attempt.abort(timeoutError)
        set({ remoteStartup: 'checking' })
        try {
          const load = get().loadGameData(config, Boolean(gameData), {
            signal: attempt.signal,
            sourceStack,
            beginCommit: () => {
              if (performance.now() >= deadline) attempt.abort(timeoutError)
              attempt.signal.throwIfAborted()
              set({ remoteStartup: 'committing' })
            },
          })
          const changed = await load
          if (remoteStartupAttempt !== attempt) return false
          const current = get()
          if (!current.error && current.cacheStatus === 'fetched') set({ remoteStartup: 'loaded' })
          else if (gameData)
            set({ remoteStartup: 'cached', cacheStatus: 'remote-cache', error: null })
          else {
            clearTimeout(timer)
            await get().loadStartupSrd()
          }
          return changed
        } finally {
          clearTimeout(timer)
          if (remoteStartupAttempt === attempt) remoteStartupAttempt = null
        }
      },

      loadStartupSrd: async () => {
        if (get().gameData) return
        const requestId = ++activeLoadRequestId
        activeLoadController?.abort()
        const controller = new AbortController()
        activeLoadController = controller
        const { signal } = controller
        const timer = setTimeout(
          () => controller.abort(new Error('Loading the Included SRD timed out.')),
          REMOTE_STARTUP_TIMEOUT_MS,
        )
        set({
          remoteStartup: 'loading-srd',
          isLoading: true,
          isBackgroundRefreshing: false,
          loadProgress: null,
          error: null,
        })
        try {
          const bundled = await settleOnAbort(resolveDefaultBundledSource(), signal)
          if (!bundled)
            throw new Error('The Included SRD is unavailable in this copy of Tavern Born.')
          const required = new Set<string>()
          const load = loadDataFromSource(bundled, {
            signal,
            onProgress: (current, total, resource) => {
              if (requestId === activeLoadRequestId && !signal.aborted)
                set({ loadProgress: { current, total, resource } })
            },
            onResourceFailure: (resource, failure) => {
              if (failure.required) required.add(resource)
            },
          })
          const data = await settleOnAbort(load, signal)
          signal.throwIfAborted()
          if (requestId !== activeLoadRequestId) return
          if (required.size || getCatalogEntityCount(data) === 0)
            throw new Error('The Included SRD could not be loaded.')
          set({
            gameData: data,
            remoteStartup: 'srd',
            sessionBundledSource: bundled,
            cacheStatus: 'session-srd',
            isLoading: false,
            loadProgress: null,
          })
        } catch (error) {
          if (requestId === activeLoadRequestId)
            set({
              remoteStartup: 'unavailable',
              isLoading: false,
              loadProgress: null,
              error:
                error instanceof Error ? error.message : 'The Included SRD could not be loaded.',
            })
        } finally {
          clearTimeout(timer)
          if (activeLoadController === controller) activeLoadController = null
        }
      },

      reconfigureRemoteStartup: () => {
        if (get().remoteStartup !== 'unavailable') return
        remoteStartupPreparation?.abort()
        remoteStartupPreparation = null
        set({ remoteStartup: 'setup', cacheStatus: 'unconfigured' })
      },

      loadGameData: async (config, background = false, startup) => {
        const requestId = ++activeLoadRequestId
        if (!startup && (remoteStartupPreparation || remoteStartupAttempt)) {
          cancelRemoteStartup()
          set({ remoteStartup: null })
        }
        activeLoadController?.abort()
        const controller = new AbortController()
        activeLoadController = controller
        const signal = startup
          ? AbortSignal.any([controller.signal, startup.signal])
          : controller.signal

        if (background) {
          set({
            isBackgroundRefreshing: true,
            error: null,
            loadProgress: null,
          })
        } else {
          set({
            isLoading: true,
            error: null,
            loadProgress: null,
          })
        }

        try {
          const failedResources = new Set<string>()
          const failedRequiredResources = new Set<string>()
          const stack =
            startup?.sourceStack === undefined
              ? resolveSourceStack(config)
              : Promise.resolve(startup.sourceStack)
          const sourceStack = await (startup ? settleOnAbort(stack, signal) : stack)
          signal.throwIfAborted()
          const cacheIdentity = sourceStack ?? config
          const layerMetadata: GameDataLayerCacheMetadataByRole = {}
          const loaderOptions: DataSourceStackLoaderOptions = {
            onProgress: (current, total, resource) => {
              if (requestId === activeLoadRequestId && !signal.aborted) {
                set({ loadProgress: { current, total, resource } })
              }
            },
            onResourceFailure: (resource, failure) => {
              failedResources.add(resource)
              if (failure.required) failedRequiredResources.add(resource)
            },
            signal,
            onLayerLoaded: (role, layerData) => {
              if (signal.aborted) return
              layerMetadata[role] = {
                contentFingerprint: computeGameDataFingerprint(layerData),
                entityCount: getCatalogEntityCount(layerData),
              }
            },
          }
          const pending = sourceStack
            ? loadGameDataSourceStack(sourceStack, loaderOptions)
            : loadDataFromSource(config, loaderOptions)
          const data = await (startup ? settleOnAbort(pending, signal) : pending)
          signal.throwIfAborted()

          const existingData = get().gameData
          if (background && failedResources.size > 0) {
            throw new Error(
              `Background refresh incomplete (${failedResources.size} resource${failedResources.size === 1 ? '' : 's'} failed); keeping existing cache`,
            )
          }
          if (!background && failedRequiredResources.size > 0) {
            throw new Error(
              `Data load incomplete (${failedRequiredResources.size} required resource${failedRequiredResources.size === 1 ? '' : 's'} failed); no changes were saved`,
            )
          }
          if (
            background &&
            existingData &&
            getCatalogEntityCount(existingData) > 0 &&
            getCatalogEntityCount(data) === 0
          ) {
            throw new Error('Background refresh returned empty data; keeping existing cache')
          }
          if (startup && getCatalogEntityCount(data) === 0)
            throw new Error('The game data source returned an empty catalog.')

          // Ignore stale results from superseded requests.
          if (requestId !== activeLoadRequestId) {
            return false
          }

          const now = new Date().toISOString()
          // Persist parsed data to IDB cache so next launch is instant.
          // Pass the last known fingerprint so writeGameDataCache can detect
          // unchanged content even when the IDB cache was cleared.
          const prevChangedAt = get().lastDataChangedAt
          const prevFingerprint = get().lastContentFingerprint
          const hadGameData = get().gameData !== null
          let writeStarted = false
          const mutation = enqueueCacheMutation(() => {
            if (requestId !== activeLoadRequestId) return Promise.resolve(null)
            signal.throwIfAborted()
            writeStarted = true
            return writeGameDataCache(data, cacheIdentity, {
              fingerprint: prevFingerprint,
              lastDataChangedAt: prevChangedAt,
              ...(sourceStack ? { layerMetadata } : {}),
              ...(startup ? { signal, beforeWrite: startup.beginCommit } : {}),
            })
          })
          const cacheEntry = await (startup
            ? settleOnAbort(mutation, signal, () => !writeStarted)
            : mutation)

          // A clear or newer load may have started while the cache write was queued.
          // The queued clear still runs after this write; do not restore stale state.
          if (!cacheEntry || requestId !== activeLoadRequestId) {
            return false
          }
          const contentChanged = cacheEntry.lastDataChangedAt !== prevChangedAt
          const shouldHydrateMemory =
            contentChanged || !hadGameData || get().sessionBundledSource !== null
          set({
            gameData: shouldHydrateMemory ? data : get().gameData,
            dataSourceConfig: { ...config, isValid: true, lastLoaded: now },
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
            lastLoadedAt: now,
            ...(contentChanged || !prevChangedAt
              ? { lastDataChangedAt: cacheEntry.lastDataChangedAt ?? now }
              : {}),
            lastContentFingerprint: cacheEntry.contentFingerprint ?? null,
            lastUpdateCheckAt: now,
            cacheStatus: 'fetched',
            sessionBundledSource: null,
          })
          return contentChanged
        } catch (error) {
          // Ignore stale request failures and intentional aborts.
          if (requestId !== activeLoadRequestId) {
            return false
          }

          const isAbortError =
            (error instanceof DOMException && error.name === 'AbortError') ||
            (error instanceof Error && error.name === 'AbortError')
          if (isAbortError) {
            set({
              isLoading: false,
              isBackgroundRefreshing: false,
              loadProgress: null,
            })
            return false
          }

          set({
            error: error instanceof Error ? error.message : 'Failed to load game data',
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
          })
          return false
        } finally {
          if (activeLoadController === controller) {
            activeLoadController = null
          }
        }
      },

      refreshGameData: async () => {
        const { dataSourceConfig } = get()
        if (dataSourceConfig) {
          await get().loadGameData(dataSourceConfig)
        }
      },

      restoreBundledData: async () => {
        const bundledSource = await resolveDefaultBundledSource()
        if (!bundledSource) {
          set({
            error:
              'The Included SRD is unavailable in this copy of Tavern Born. Reinstall the app or add compatible 5etools data in Settings.',
          })
          return false
        }

        await get().loadGameData(bundledSource)
        const state = get()
        return (
          !state.error &&
          state.gameData !== null &&
          state.dataSourceConfig?.type === 'bundled' &&
          state.dataSourceConfig.packId === bundledSource.packId &&
          state.dataSourceConfig.packVersion === bundledSource.packVersion
        )
      },

      clearGameData: async () => {
        // Invalidate results even when the underlying operation (notably local IPC
        // reads or an IndexedDB write) cannot be cancelled by AbortController.
        activeLoadRequestId += 1
        cancelRemoteStartup()
        activeLoadController?.abort()
        activeLoadController = null
        set({
          gameData: null,
          dataSourceConfig: null,
          isLoading: false,
          isBackgroundRefreshing: false,
          loadProgress: null,
          error: null,
          lastLoadedAt: null,
          lastDataChangedAt: null,
          lastContentFingerprint: null,
          lastUpdateCheckAt: null,
          cacheStatus: 'unconfigured',
          remoteStartup: null,
          sessionBundledSource: null,
        })
        // Serialize cache mutations so a write already in flight is always followed
        // by this deletion, while later user-initiated loads write after the clear.
        await enqueueCacheMutation(clearGameDataCache)
      },
    }),
    {
      name: 'game-data-storage',
      storage: createIdbStorage(),
      version: GAME_DATA_STORE_VERSION,
      migrate: migrateGameDataPersistedState,
      // Only persist the config — game data is cached separately in dataCache.ts.
      partialize: (state) => ({
        dataSourceConfig: state.dataSourceConfig,
        lastLoadedAt: state.lastLoadedAt,
        lastDataChangedAt: state.lastDataChangedAt,
        lastContentFingerprint: state.lastContentFingerprint,
        lastUpdateCheckAt: state.lastUpdateCheckAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
