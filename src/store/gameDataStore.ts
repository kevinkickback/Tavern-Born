import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveDefaultBundledSource } from '@/lib/5etools/bundledSource'
import type { PreparedCatalog } from '@/lib/5etools/catalogCandidate'
import { externalCatalogKeys } from '@/lib/5etools/contentLayers'
import type { DataLoaderOptions } from '@/lib/5etools/dataLoader'
import { loadDataFromSource } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { settleOnAbort } from '@/lib/abortable'
import {
  clearGameDataCache,
  computeGameDataFingerprint,
  GAME_DATA_SETTINGS_KEY,
  GAME_DATA_STORE_VERSION,
  isCacheForSource,
  isCacheStale,
  readGameDataCachePair,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import type { BundledDataSourceConfig, DataSourceConfig, GameData } from '@/types/5etools'

let activeLoadController: AbortController | null = null
let activeLoadRequestId = 0
let lastClearRequestId = 0
let remoteStartupPreparation: AbortController | null = null
let cacheMutationQueue: Promise<void> = Promise.resolve()

export const REMOTE_STARTUP_TIMEOUT_MS = 15_000
const remoteTimeout = () =>
  new DOMException('The game data source did not respond within 15 seconds.', 'TimeoutError')

function cancelRemoteStartup() {
  remoteStartupPreparation?.abort()
  remoteStartupPreparation = null
}

type RemoteStartupStatus = 'checking' | 'unavailable' | 'loading-srd' | 'setup'

type CatalogResult =
  | { kind: 'applied'; changed: boolean }
  | { kind: 'staged' | 'superseded' }
  | { kind: 'rejected'; message: string }

interface CatalogRequest {
  stage?: boolean
  prepared?: PreparedCatalog
  confirmed?: boolean
  session?: boolean
  folderGrant?: string
}

function releaseFolderGrant(root: string | undefined) {
  if (root) window.electronAPI?.discardLocalDataRoot?.(root)
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

function hasCatalogRecords(data: GameData): boolean {
  return Object.values(data).some((rows) => Array.isArray(rows) && rows.length > 0)
}

interface LoadProgress {
  current: number
  total: number
  resource: string
}

/** How the current gameData was sourced this session. */
export type CacheStatus =
  | 'unknown' // initial, before hydration
  | 'fresh' // loaded from cache, within 24 h, same source
  | 'stale' // loaded from cache, being refreshed in background
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
  /** Digest of the last accepted catalog. */
  lastContentFingerprint: string | null
  lastUpdateCheckAt: string | null
  lastAttemptAt: string | null
  catalogWarnings: string[]
  externalKeys: string[] | undefined
  pendingCatalog: {
    candidate: PreparedCatalog
    removals: string[]
    incompleteRemovalPreview: boolean
    folderGrant?: string
  } | null
  cacheStatus: CacheStatus
  remoteStartup: RemoteStartupStatus | null
  bundledUnavailable: boolean
  sessionBundledSource: BundledDataSourceConfig | null
  /** True once the Zustand persist middleware has read back from IDB. */
  hasHydrated: boolean

  setGameData: (data: GameData) => void
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
    retry?: boolean
  }) => Promise<{ backgroundRefresh?: Promise<boolean> }>

  /**
   * Fetch data from `config`, write to IDB cache, and update the store. Resolves
   * true only when the content fingerprint changed. Pass `background = true`
   * to refresh without blocking or clearing the current data.
   */
  loadGameData: (config: DataSourceConfig, background?: boolean) => Promise<boolean>
  loadCatalog: (
    config: DataSourceConfig,
    background?: boolean,
    request?: CatalogRequest,
  ) => Promise<CatalogResult>
  reconfigureRemoteStartup: () => void
  invalidatePendingFolderSelection: () => void
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
      lastAttemptAt: null,
      catalogWarnings: [],
      externalKeys: undefined,
      pendingCatalog: null,
      cacheStatus: 'unknown',
      remoteStartup: null,
      bundledUnavailable: false,
      sessionBundledSource: null,
      hasHydrated: false,

      setGameData: (data) =>
        set({
          gameData: data.lookups ? data : { ...data, lookups: buildGameDataLookups(data) },
        }),
      setHasHydrated: (v) => set({ hasHydrated: v }),

      loadFromCache: async (opts) => {
        if (remoteStartupPreparation || get().isLoading) return {}
        const controller = new AbortController()
        remoteStartupPreparation = controller
        const { signal } = controller
        const timer = setTimeout(() => controller.abort(remoteTimeout()), REMOTE_STARTUP_TIMEOUT_MS)
        const [pair, installed] = await Promise.all([
          settleOnAbort(readGameDataCachePair(), signal).catch(() => null),
          settleOnAbort(resolveDefaultBundledSource(), signal).catch(() => null),
        ])
        clearTimeout(timer)
        if (remoteStartupPreparation !== controller) return {}
        remoteStartupPreparation = null
        const availableCache = pair?.cache
        if (pair?.settings) {
          const state = migrateGameDataPersistedState(pair.settings) as typeof pair.settings
          set({
            dataSourceConfig: state.dataSourceConfig ?? null,
            lastUpdateCheckAt: state.lastUpdateCheckAt ?? null,
          })
        }
        const { dataSourceConfig: config } = get()
        const desktop = typeof window.electronAPI?.getBundledManifest === 'function'
        set({ bundledUnavailable: desktop && !installed })
        const external = config?.type === 'bundled' ? null : config
        const identity = installed
          ? external
            ? { base: installed, additional: external }
            : installed
          : config?.type !== 'bundled' || !desktop
            ? config
            : null
        if (
          external &&
          availableCache?.sourceSnapshot.type === external.type &&
          availableCache.sourceSnapshot.path === external.path
        ) {
          set({ externalKeys: availableCache.externalKeys })
        }
        const openCache = (source: typeof identity) => {
          if (!availableCache || !source || !isCacheForSource(availableCache, source)) return false
          const { data, contentFingerprint, cachedAt, lastDataChangedAt, externalKeys } =
            availableCache
          set({
            gameData: data.lookups ? data : { ...data, lookups: buildGameDataLookups(data) },
            lastDataChangedAt: lastDataChangedAt ?? cachedAt,
            lastContentFingerprint:
              contentFingerprint?.length === 64
                ? contentFingerprint
                : computeGameDataFingerprint(data),
            externalKeys,
            cacheStatus: isCacheStale(cachedAt) ? 'stale' : 'fresh',
            remoteStartup: null,
            error: null,
          })
          return true
        }
        if (!openCache(identity)) {
          if (installed) {
            set({ remoteStartup: 'loading-srd' })
            const result = await get().loadCatalog(installed, false, { session: Boolean(external) })
            if (result.kind === 'superseded') return {}
            if (result.kind === 'rejected') set({ bundledUnavailable: true })
          }
          if (!get().gameData && !openCache(external)) {
            if (external && (opts?.retry || (opts?.forceCheck && !desktop && !installed))) {
              set({ remoteStartup: 'checking' })
              const result = await get().loadCatalog(external)
              if (result.kind === 'staged')
                set({ remoteStartup: 'setup', cacheStatus: 'unconfigured' })
              else if (result.kind === 'rejected') set({ remoteStartup: 'unavailable' })
            } else if (config || desktop) {
              set({
                remoteStartup: 'unavailable',
                bundledUnavailable: true,
                error: get().error ?? 'The Included SRD could not be verified.',
              })
            } else set({ cacheStatus: 'unconfigured' })
            return {}
          }
        }

        if (external && opts?.forceCheck && get().gameData && get().dataSourceConfig === config) {
          return {
            backgroundRefresh: get()
              .loadCatalog(external, true, { stage: true })
              .then((result) => result.kind === 'applied' && result.changed),
          }
        }
        return {}
      },

      reconfigureRemoteStartup: () => {
        if (get().remoteStartup !== 'unavailable') return
        remoteStartupPreparation?.abort()
        remoteStartupPreparation = null
        set({ remoteStartup: 'setup', cacheStatus: 'unconfigured' })
      },

      invalidatePendingFolderSelection: () => {
        // Electron allows one temporary picker grant. A new selection replaces it.
        if (get().pendingCatalog?.folderGrant) set({ pendingCatalog: null, catalogWarnings: [] })
      },

      loadGameData: async (config, background) => {
        const result = await get().loadCatalog(config, background)
        return result.kind === 'applied' && result.changed
      },

      loadCatalog: async (config, background = false, request) => {
        const pending = get().pendingCatalog
        if (request?.confirmed && request.prepared !== pending?.candidate)
          return { kind: 'superseded' }
        const folderGrant = request?.confirmed ? pending?.folderGrant : request?.folderGrant
        if (pending?.folderGrant !== folderGrant) releaseFolderGrant(pending?.folderGrant)
        const requestId = ++activeLoadRequestId
        cancelRemoteStartup()
        activeLoadController?.abort()
        const controller = new AbortController()
        activeLoadController = controller
        const timeout = setTimeout(
          () => controller.abort(remoteTimeout()),
          REMOTE_STARTUP_TIMEOUT_MS,
        )
        const { signal } = controller

        set({
          ...(config.type !== 'bundled' && !request?.prepared
            ? { lastAttemptAt: new Date().toISOString() }
            : {}),
          pendingCatalog: null,
          isLoading: !background,
          isBackgroundRefreshing: background,
          error: null,
          loadProgress: null,
        })

        try {
          const failedResources = new Set<string>()
          const failedRequiredResources = new Set<string>()
          const loaderOptions: DataLoaderOptions = {
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
          }
          let candidate = request?.prepared
          if (!candidate && config.type !== 'bundled') {
            const { prepareCatalog } = await import('@/lib/5etools/catalogCandidate')
            const base = get().bundledUnavailable
              ? null
              : await settleOnAbort(resolveDefaultBundledSource(), signal)
            candidate = await settleOnAbort(
              prepareCatalog(config, base ?? undefined, signal, loaderOptions.onProgress),
              signal,
            )
          }
          const data =
            candidate?.data ??
            (await settleOnAbort(loadDataFromSource(config, loaderOptions), signal))
          signal.throwIfAborted()
          await settleOnAbort(cacheMutationQueue, signal)
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
            hasCatalogRecords(existingData) &&
            !hasCatalogRecords(data)
          ) {
            throw new Error('Background refresh returned empty data; keeping existing cache')
          }
          const cacheIdentity = candidate?.identity ?? config
          const prior = get()
          const priorSource = prior.dataSourceConfig
          const hadExternal = priorSource && priorSource.type !== 'bundled'
          const hasPriorExternalData =
            hadExternal &&
            (priorSource.lastLoaded || (prior.gameData && !prior.sessionBundledSource))
          const incompleteRemovalPreview = Boolean(hasPriorExternalData && !prior.externalKeys)
          const currentKeys = new Set(candidate?.keys)
          const resources = candidate?.config.availableResources ?? []
          const removedFiles = hadExternal
            ? (priorSource.availableResources ?? []).filter(
                (file) =>
                  !file.startsWith('fluff-') &&
                  file !== 'book/book-tce.json' &&
                  !resources.includes(file),
              )
            : []
          const removals = [...removedFiles]
          if (candidate && hadExternal) {
            if (prior.externalKeys) {
              removals.push(...prior.externalKeys.filter((key) => !currentKeys.has(key)))
            } else if (prior.gameData && !prior.sessionBundledSource) {
              const keys = new Set(externalCatalogKeys(data))
              removals.push(...externalCatalogKeys(prior.gameData).filter((key) => !keys.has(key)))
            }
          }
          if (
            candidate &&
            !request?.confirmed &&
            (removals.length ||
              incompleteRemovalPreview ||
              (request?.stage &&
                (prior.sessionBundledSource ||
                  computeGameDataFingerprint(data) !== prior.lastContentFingerprint)))
          ) {
            if (requestId !== activeLoadRequestId) return { kind: 'superseded' }
            set({
              pendingCatalog: {
                candidate,
                removals,
                incompleteRemovalPreview,
                ...(folderGrant ? { folderGrant } : {}),
              },
              isLoading: false,
              isBackgroundRefreshing: false,
              loadProgress: null,
              lastUpdateCheckAt: new Date().toISOString(),
              catalogWarnings: candidate.warnings,
            })
            return { kind: 'staged' }
          }

          if (requestId !== activeLoadRequestId) return { kind: 'superseded' }
          if (config.type === 'bundled' && !hasCatalogRecords(data))
            throw new Error('The Included SRD could not be loaded.')
          if (request?.session && config.type === 'bundled') {
            set({
              gameData: data,
              remoteStartup: null,
              sessionBundledSource: config,
              bundledUnavailable: false,
              cacheStatus: 'session-srd',
              isLoading: false,
              loadProgress: null,
            })
            return { kind: 'applied', changed: true }
          }

          const now = new Date().toISOString()
          const acceptedConfig = candidate
            ? { ...candidate.config, acceptedRevision: candidate.revision, lastLoaded: now }
            : { ...config, isValid: true, lastLoaded: now }
          // Persist parsed data to IDB cache so next launch is instant.
          // Pass the last known fingerprint so writeGameDataCache can detect
          // unchanged content even when the IDB cache was cleared.
          const prevChangedAt = get().lastDataChangedAt
          const prevFingerprint = get().lastContentFingerprint
          const hadGameData = get().gameData !== null
          let writeStarted = false
          const mutation = enqueueCacheMutation(async () => {
            if (requestId !== activeLoadRequestId) return { kind: 'superseded' } as const
            signal.throwIfAborted()
            if (config.type === 'local')
              await settleOnAbort(
                Promise.resolve(window.electronAPI?.approveLocalDataRoot?.(config.path)),
                signal,
              )
            writeStarted = true
            const cacheEntry = await writeGameDataCache(data, cacheIdentity, {
              fingerprint: prevFingerprint,
              lastDataChangedAt: prevChangedAt,
              layerMetadata: candidate?.layerMetadata,
              signal,
              config: acceptedConfig,
              externalKeys: candidate?.keys,
            })
            if (requestId < lastClearRequestId) return { kind: 'superseded' } as const

            // Publish a committed pair before the next queued operation can use it.
            const contentChanged = cacheEntry.contentFingerprint !== prevFingerprint
            const shouldHydrateMemory =
              contentChanged || !hadGameData || get().sessionBundledSource !== null
            set({
              gameData: shouldHydrateMemory ? data : get().gameData,
              dataSourceConfig: acceptedConfig,
              externalKeys: candidate?.keys,
              catalogWarnings: candidate?.warnings ?? [],
              ...(requestId === activeLoadRequestId
                ? { isLoading: false, isBackgroundRefreshing: false, loadProgress: null }
                : {}),
              lastLoadedAt: now,
              lastDataChangedAt: cacheEntry.lastDataChangedAt ?? now,
              lastContentFingerprint: cacheEntry.contentFingerprint ?? null,
              lastUpdateCheckAt: now,
              cacheStatus: 'fetched',
              remoteStartup: null,
              bundledUnavailable: config.type !== 'bundled' && get().bundledUnavailable,
              sessionBundledSource: null,
            })
            return { kind: 'applied', changed: contentChanged } as const
          })
          return await settleOnAbort(mutation, signal, () => !writeStarted)
        } catch (error) {
          // Ignore stale request failures and intentional aborts.
          if (requestId !== activeLoadRequestId) {
            return { kind: 'superseded' }
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
            return { kind: 'superseded' }
          }

          const message = error instanceof Error ? error.message : 'Failed to load game data'
          set({
            error: message,
            ...(request?.stage && get().gameData && !get().sessionBundledSource
              ? { cacheStatus: 'remote-cache' as const }
              : {}),
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
          })
          return { kind: 'rejected', message }
        } finally {
          clearTimeout(timeout)
          if (folderGrant !== get().pendingCatalog?.folderGrant) releaseFolderGrant(folderGrant)
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
        lastClearRequestId = ++activeLoadRequestId
        cancelRemoteStartup()
        activeLoadController?.abort()
        activeLoadController = null
        releaseFolderGrant(get().pendingCatalog?.folderGrant)
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
          lastAttemptAt: null,
          catalogWarnings: [],
          externalKeys: undefined,
          pendingCatalog: null,
          cacheStatus: 'unconfigured',
          remoteStartup: null,
          sessionBundledSource: null,
        })
        // Serialize cache mutations so a write already in flight is always followed
        // by this deletion, while later user-initiated loads write after the clear.
        await enqueueCacheMutation(() => clearGameDataCache(true))
      },
    }),
    {
      name: GAME_DATA_SETTINGS_KEY,
      // The cache transaction owns the durable settings write.
      storage: {
        ...createIdbStorage({ allowUnreadable: true }),
        setItem: () => Promise.resolve(),
      },
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
