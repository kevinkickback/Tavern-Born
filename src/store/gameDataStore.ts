import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveDefaultBundledSource } from '@/lib/5etools/bundledSource'
import {
  compareCatalogCandidate,
  hasCatalogWorker,
  loadBundledCatalog,
  materializeCatalogCandidate,
  prepareCatalogCandidate,
  releaseCatalogCandidate,
  repairCatalog,
} from '@/lib/5etools/catalogClient'
import type { CatalogCandidate } from '@/lib/5etools/catalogProtocol'
import {
  type CatalogRefreshCheck,
  isCatalogCheckDue,
  refreshCheckForSource,
} from '@/lib/5etools/catalogRefreshPolicy'
import { hasCatalogRecords } from '@/lib/5etools/contentLayers'
import type { DataLoaderOptions } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { settleOnAbort } from '@/lib/abortable'
import {
  cacheMetadata,
  computeGameDataFingerprint,
  GAME_DATA_SETTINGS_KEY,
  GAME_DATA_STORE_VERSION,
  type GameDataCacheMetadata,
  isCacheForSource,
  markCatalogChecked,
  persistCatalogRepair,
  readGameDataCachePair,
  writeCatalogRefreshCheck,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import type { BundledDataSourceConfig, DataSourceConfig, GameData } from '@/types/5etools'

let activeLoadController: AbortController | null = null
let activeLoadRequestId = 0
let remoteStartupPreparation: AbortController | null = null
let cacheMutationQueue: Promise<void> = Promise.resolve()
let acceptedCache: GameDataCacheMetadata | null = null

export const STARTUP_CATALOG_TIMEOUT_MS = 15_000
export const INTERACTIVE_CATALOG_TIMEOUT_MS = 60_000
const catalogTimeout = (timeoutMs: number) =>
  new DOMException(
    `The game data source did not respond within ${timeoutMs / 1000} seconds.`,
    'TimeoutError',
  )

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
  prepared?: CatalogCandidate
  confirmed?: boolean
  session?: boolean
  startup?: boolean
  recovery?: boolean
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

interface LoadProgress {
  current: number
  total: number
  resource: string
}

/** How the current gameData was sourced this session. */
export type CacheStatus =
  | 'unknown' // initial, before hydration
  | 'cached' // loaded from a matching cache
  | 'remote-cache' // accepted catalog retained after a failed or timed-out check
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
  lastDataChangedAt: string | null
  /** Digest of the last accepted catalog. */
  lastContentFingerprint: string | null
  savedContentFingerprint: string | null
  lastUpdateCheckAt: string | null
  catalogRefreshCheck: CatalogRefreshCheck | undefined
  catalogWarnings: string[]
  externalKeys: string[] | undefined
  pendingCatalog: {
    candidate: CatalogCandidate
    reason: 'reload' | 'recovery' | 'update' | 'review'
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

  /** Open the local catalog and optionally check the configured source in the background. */
  loadFromCache: (opts?: {
    checkForUpdates?: boolean
    retry?: boolean
  }) => Promise<{ backgroundRefresh?: Promise<boolean> }>
  checkCatalogIfDue: (startup?: boolean) => Promise<boolean> | undefined

  /** Prepare a catalog. Background checks stage changed content for explicit Apply. */
  loadCatalog: (
    config: DataSourceConfig,
    background?: boolean,
    request?: CatalogRequest,
  ) => Promise<CatalogResult>
  reconfigureRemoteStartup: () => void
  invalidatePendingFolderSelection: () => void
  restoreBundledData: () => Promise<boolean>
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
      lastDataChangedAt: null,
      lastContentFingerprint: null,
      savedContentFingerprint: null,
      lastUpdateCheckAt: null,
      catalogRefreshCheck: undefined,
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

      checkCatalogIfDue: (startup = false) => {
        const state = get()
        const config = state.dataSourceConfig
        if (
          !config ||
          config.type === 'bundled' ||
          !state.gameData ||
          remoteStartupPreparation ||
          state.isLoading ||
          state.isBackgroundRefreshing ||
          state.pendingCatalog ||
          !isCatalogCheckDue(
            config,
            state.catalogRefreshCheck,
            state.lastUpdateCheckAt,
            state.sessionBundledSource !== null,
            Date.now(),
          )
        )
          return

        return get()
          .loadCatalog(config, true, { startup })
          .then((result) => result.kind === 'applied' && result.changed)
      },

      loadFromCache: async (opts) => {
        if (remoteStartupPreparation || get().isLoading || get().isBackgroundRefreshing) return {}
        const startupRequestId = activeLoadRequestId
        const controller = new AbortController()
        remoteStartupPreparation = controller
        const { signal } = controller
        const startup = !opts?.retry
        const timeoutMs = startup ? STARTUP_CATALOG_TIMEOUT_MS : INTERACTIVE_CATALOG_TIMEOUT_MS
        const timer = setTimeout(() => controller.abort(catalogTimeout(timeoutMs)), timeoutMs)
        const [pair, installed] = await Promise.all([
          settleOnAbort(readGameDataCachePair(), signal).catch(() => null),
          settleOnAbort(resolveDefaultBundledSource(), signal).catch(() => null),
        ])
        clearTimeout(timer)
        if (remoteStartupPreparation !== controller) return {}
        remoteStartupPreparation = null
        const availableCache = pair?.cache
        if (pair) set({ catalogRefreshCheck: pair.refreshCheck })
        if (pair?.settings) {
          const state = migrateGameDataPersistedState(pair.settings) as typeof pair.settings
          set({
            dataSourceConfig: state.dataSourceConfig ?? null,
            lastUpdateCheckAt: state.lastUpdateCheckAt ?? null,
            savedContentFingerprint: state.lastContentFingerprint ?? null,
          })
        }
        const { dataSourceConfig: config } = get()
        const desktop = typeof window.electronAPI?.getBundledManifest === 'function'
        set({ bundledUnavailable: desktop && !installed })
        const external = config?.type === 'bundled' ? null : config
        if (external) {
          const lastSuccessAt = refreshCheckForSource(
            pair?.refreshCheck,
            external,
            Date.now(),
          )?.lastSuccessAt
          const lastCheckedAt = Date.parse(get().lastUpdateCheckAt ?? '')
          if (lastSuccessAt != null && lastSuccessAt > (lastCheckedAt || 0)) {
            set({ lastUpdateCheckAt: new Date(lastSuccessAt).toISOString() })
          }
        }
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
        const openCache = async (source: typeof identity) => {
          if (!availableCache || !source || !isCacheForSource(availableCache, source)) return false
          let { data, contentFingerprint } = availableCache
          const { cachedAt, lastDataChangedAt, externalKeys } = availableCache
          if (availableCache.sourceSnapshot.type === 'bundled' && !hasCatalogRecords(data))
            return false
          if (hasCatalogWorker() && (!data.lookups || contentFingerprint?.length !== 64)) {
            const repairController = new AbortController()
            remoteStartupPreparation = repairController
            const repairTimeout = setTimeout(
              () => repairController.abort(catalogTimeout(timeoutMs)),
              timeoutMs,
            )
            try {
              const repaired = await repairCatalog(
                data,
                contentFingerprint?.length === 64 ? contentFingerprint : undefined,
                repairController.signal,
              )
              const entry = await enqueueCacheMutation(() =>
                persistCatalogRepair(availableCache, repaired, repairController.signal),
              )
              if (!entry || repairController.signal.aborted) return false
              data = entry.data
              contentFingerprint = entry.contentFingerprint
              acceptedCache = cacheMetadata(entry)
            } catch {
              return false
            } finally {
              clearTimeout(repairTimeout)
              if (remoteStartupPreparation === repairController) remoteStartupPreparation = null
            }
          } else if (hasCatalogWorker()) {
            acceptedCache = cacheMetadata(availableCache)
          }
          set({
            gameData: data.lookups ? data : { ...data, lookups: buildGameDataLookups(data) },
            lastDataChangedAt: lastDataChangedAt ?? cachedAt,
            lastContentFingerprint:
              contentFingerprint?.length === 64
                ? contentFingerprint
                : computeGameDataFingerprint(data),
            externalKeys,
            cacheStatus: 'cached',
            remoteStartup: null,
            error: null,
          })
          return true
        }
        const opened = await openCache(identity)
        if (startupRequestId !== activeLoadRequestId) return {}
        if (!opened) {
          if (installed) {
            set({ remoteStartup: 'loading-srd' })
            const result = await get().loadCatalog(installed, false, {
              session: Boolean(external),
              startup,
            })
            if (result.kind === 'superseded') return {}
            if (result.kind === 'rejected') set({ bundledUnavailable: true })
          }
          const fallbackRequestId = activeLoadRequestId
          const openedFallback = get().gameData || (await openCache(external))
          if (fallbackRequestId !== activeLoadRequestId) return {}
          if (!openedFallback) {
            if (
              external &&
              (opts?.retry ||
                (opts?.checkForUpdates &&
                  !desktop &&
                  !installed &&
                  isCatalogCheckDue(
                    external,
                    get().catalogRefreshCheck,
                    get().lastUpdateCheckAt,
                    true,
                    Date.now(),
                  )))
            ) {
              set({ remoteStartup: 'checking' })
              const result = await get().loadCatalog(external, false, { startup, recovery: true })
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

        if (external && opts?.checkForUpdates && get().dataSourceConfig === config) {
          const backgroundRefresh = opts.retry
            ? get()
                .loadCatalog(external, true)
                .then((result) => result.kind === 'applied' && result.changed)
            : get().checkCatalogIfDue(true)
          if (backgroundRefresh) return { backgroundRefresh }
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
        const pending = get().pendingCatalog
        if (pending?.folderGrant) {
          releaseCatalogCandidate(pending.candidate)
          set({ pendingCatalog: null, catalogWarnings: [] })
        }
      },

      loadCatalog: async (config, background = false, request) => {
        const pending = get().pendingCatalog
        if (request?.confirmed && request.prepared !== pending?.candidate)
          return { kind: 'superseded' }
        if (pending?.candidate !== request?.prepared) releaseCatalogCandidate(pending?.candidate)
        const folderGrant = request?.confirmed ? pending?.folderGrant : request?.folderGrant
        if (pending?.folderGrant !== folderGrant) releaseFolderGrant(pending?.folderGrant)
        const requestId = ++activeLoadRequestId
        cancelRemoteStartup()
        activeLoadController?.abort()
        const controller = new AbortController()
        activeLoadController = controller
        const timeoutMs = request?.startup
          ? STARTUP_CATALOG_TIMEOUT_MS
          : INTERACTIVE_CATALOG_TIMEOUT_MS
        const timeout = setTimeout(() => controller.abort(catalogTimeout(timeoutMs)), timeoutMs)
        const { signal } = controller
        const startedAt = Date.now()
        const configured = get().dataSourceConfig
        const tracksCheck =
          config.type !== 'bundled' &&
          (background || request?.recovery) &&
          !request?.prepared &&
          configured?.type === config.type &&
          configured.path === config.path
        const previousCheck = tracksCheck
          ? refreshCheckForSource(get().catalogRefreshCheck, config, startedAt)
          : undefined

        const rememberCheck = (succeeded: boolean, needsReview = false) => {
          if (!tracksCheck || requestId !== activeLoadRequestId) return
          const check: CatalogRefreshCheck = {
            source: { type: config.type, path: config.path },
            lastAttemptAt: startedAt,
            lastSuccessAt: succeeded ? Date.now() : (previousCheck?.lastSuccessAt ?? null),
            consecutiveFailures: succeeded ? 0 : (previousCheck?.consecutiveFailures ?? 0) + 1,
            needsReview: needsReview || (!succeeded && previousCheck?.needsReview),
          }
          set({ catalogRefreshCheck: check })
          // Scheduling metadata is best effort and independent of catalog activation.
          return writeCatalogRefreshCheck(check).catch(() => undefined)
        }

        set({
          pendingCatalog: null,
          isLoading: !background,
          isBackgroundRefreshing: background,
          error: null,
          loadProgress: null,
        })

        let candidate = request?.prepared
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
          let data: GameData | undefined
          let contentFingerprint: string | undefined
          if (!candidate && config.type !== 'bundled') {
            const base = get().bundledUnavailable
              ? null
              : await settleOnAbort(resolveDefaultBundledSource(), signal)
            candidate = await settleOnAbort(
              prepareCatalogCandidate(config, base ?? undefined, signal, loaderOptions.onProgress),
              signal,
            )
          }
          let failureCount = 0
          let requiredFailureCount = 0
          if (config.type === 'bundled') {
            if (import.meta.env.DESKTOP_CATALOG_WORKER || hasCatalogWorker()) {
              const result = await loadBundledCatalog(config, signal, loaderOptions.onProgress)
              data = result.data
              contentFingerprint = result.contentFingerprint
              failureCount = result.failed
              requiredFailureCount = result.required
            } else {
              const { loadDataFromSource } = await import('@/lib/5etools/dataLoader')
              data = await settleOnAbort(loadDataFromSource(config, loaderOptions), signal)
              failureCount = failedResources.size
              requiredFailureCount = failedRequiredResources.size
            }
          }
          signal.throwIfAborted()
          await settleOnAbort(cacheMutationQueue, signal)
          const existingData = get().gameData
          if (background && failureCount > 0) {
            throw new Error(
              `Background refresh incomplete (${failureCount} resource${failureCount === 1 ? '' : 's'} failed); keeping existing cache`,
            )
          }
          if (!background && requiredFailureCount > 0) {
            throw new Error(
              `Data load incomplete (${requiredFailureCount} required resource${requiredFailureCount === 1 ? '' : 's'} failed); no changes were saved`,
            )
          }
          if (
            background &&
            existingData &&
            hasCatalogRecords(existingData) &&
            !(
              candidate &&
              ('workerId' in candidate ||
                candidate.keys.length ||
                hasCatalogRecords(candidate.data))
            ) &&
            !(data && hasCatalogRecords(data))
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
          const { removals, incompleteRemovalPreview, sameExternalKeys } =
            candidate && !request?.confirmed
              ? await compareCatalogCandidate(
                  candidate,
                  {
                    config: priorSource,
                    externalKeys: prior.externalKeys,
                    fallbackData:
                      hadExternal && !prior.externalKeys && !prior.sessionBundledSource
                        ? (prior.gameData ?? undefined)
                        : undefined,
                    hasExternalData: Boolean(hasPriorExternalData),
                  },
                  signal,
                )
              : { removals: [], incompleteRemovalPreview: false, sameExternalKeys: false }
          if (candidate && 'workerId' in candidate)
            contentFingerprint = candidate.contentFingerprint
          const candidateFingerprint =
            candidate && !request?.confirmed && (background || incompleteRemovalPreview)
              ? 'workerId' in candidate
                ? candidate.contentFingerprint
                : computeGameDataFingerprint(candidate.data)
              : undefined
          const fingerprintMatches = candidateFingerprint === prior.lastContentFingerprint
          if (
            candidate &&
            !request?.confirmed &&
            (removals.length ||
              incompleteRemovalPreview ||
              (background && (prior.sessionBundledSource || !fingerprintMatches)))
          ) {
            if (requestId !== activeLoadRequestId) return { kind: 'superseded' }
            const sameSource =
              priorSource?.type === candidate.config.type &&
              priorSource.path === candidate.config.path
            const recovering = !!prior.sessionBundledSource || !prior.gameData
            const reason =
              removals.length || (!recovering && !fingerprintMatches && !candidate.warnings.length)
                ? 'update'
                : recovering && sameSource
                  ? candidateFingerprint === prior.savedContentFingerprint &&
                    !candidate.warnings.length
                    ? 'reload'
                    : 'recovery'
                  : 'review'
            const recorded = rememberCheck(true, true)
            set({
              pendingCatalog: {
                candidate,
                reason,
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
            await recorded
            return { kind: 'staged' }
          }

          if (requestId !== activeLoadRequestId) return { kind: 'superseded' }
          signal.throwIfAborted()
          const cached = acceptedCache
          const layerMetadata = candidate?.layerMetadata
          if (
            candidate &&
            'workerId' in candidate &&
            background &&
            prior.gameData &&
            !prior.sessionBundledSource &&
            cached &&
            cached.contentFingerprint === contentFingerprint &&
            sameExternalKeys &&
            (cached.sourceSnapshot.layers ?? []).every(
              (layer) =>
                layer.contentFingerprint === layerMetadata?.[layer.role]?.contentFingerprint &&
                layer.entityCount === layerMetadata?.[layer.role]?.entityCount,
            ) &&
            isCacheForSource(cached, cacheIdentity)
          ) {
            const now = new Date().toISOString()
            const checkedConfig = {
              ...candidate.config,
              acceptedRevision: candidate.revision,
              lastLoaded: priorSource?.lastLoaded,
            }
            const warnings = candidate.warnings
            const result = await enqueueCacheMutation(async () => {
              signal.throwIfAborted()
              const generation = await markCatalogChecked(cached, checkedConfig, now, signal)
              if (!generation)
                throw new Error('The game data cache changed during the check. Try again.')
              acceptedCache = { ...cached, generation }
              set({
                dataSourceConfig: checkedConfig,
                catalogWarnings: warnings,
                lastUpdateCheckAt: now,
                cacheStatus: 'cached',
                ...(requestId === activeLoadRequestId
                  ? { isBackgroundRefreshing: false, loadProgress: null }
                  : {}),
              })
              return { kind: 'applied', changed: false } as const
            })
            await rememberCheck(true)
            return result
          }
          const prepared = candidate
            ? await materializeCatalogCandidate(candidate, signal)
            : undefined
          const acceptedData = prepared?.data ?? data
          if (!acceptedData || (config.type === 'bundled' && !hasCatalogRecords(acceptedData)))
            throw new Error('The Included SRD could not be loaded.')
          if (request?.session && config.type === 'bundled') {
            set({
              gameData: acceptedData,
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
            const cacheEntry = await writeGameDataCache(acceptedData, cacheIdentity, {
              fingerprint: prevFingerprint,
              lastDataChangedAt: prevChangedAt,
              layerMetadata: candidate?.layerMetadata,
              signal,
              config: acceptedConfig,
              externalKeys: prepared?.keys,
              ...(hasCatalogWorker() ? { contentFingerprint, previous: acceptedCache } : {}),
            })
            if (hasCatalogWorker()) acceptedCache = cacheMetadata(cacheEntry)

            // Publish a committed pair before the next queued operation can use it.
            const contentChanged = cacheEntry.contentFingerprint !== prevFingerprint
            const shouldHydrateMemory =
              contentChanged || !hadGameData || get().sessionBundledSource !== null
            set({
              gameData: shouldHydrateMemory ? acceptedData : get().gameData,
              dataSourceConfig: acceptedConfig,
              externalKeys: prepared?.keys,
              catalogWarnings: candidate?.warnings ?? [],
              ...(requestId === activeLoadRequestId
                ? { isLoading: false, isBackgroundRefreshing: false, loadProgress: null }
                : {}),
              lastDataChangedAt: cacheEntry.lastDataChangedAt ?? now,
              lastContentFingerprint: cacheEntry.contentFingerprint ?? null,
              lastUpdateCheckAt: now,
              catalogRefreshCheck: undefined,
              cacheStatus: 'fetched',
              remoteStartup: null,
              bundledUnavailable: config.type !== 'bundled' && get().bundledUnavailable,
              sessionBundledSource: null,
            })
            return { kind: 'applied', changed: contentChanged } as const
          })
          const result = await settleOnAbort(mutation, signal, () => !writeStarted)
          if (result.kind === 'applied') await rememberCheck(true)
          return result
        } catch (error) {
          // Ignore stale request failures and intentional aborts.
          if (requestId !== activeLoadRequestId) {
            return { kind: 'superseded' }
          }

          const failure = error instanceof DOMException || error instanceof Error ? error : null
          if (failure?.name === 'AbortError') {
            set({
              isLoading: false,
              isBackgroundRefreshing: false,
              loadProgress: null,
            })
            return { kind: 'superseded' }
          }

          const message = failure?.message ?? 'Failed to load game data'
          const recorded = rememberCheck(false)
          set({
            error: message,
            ...(background && get().gameData && !get().sessionBundledSource
              ? { cacheStatus: 'remote-cache' as const }
              : {}),
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
          })
          await recorded
          return { kind: 'rejected', message }
        } finally {
          clearTimeout(timeout)
          if (candidate !== get().pendingCatalog?.candidate) releaseCatalogCandidate(candidate)
          if (folderGrant !== get().pendingCatalog?.folderGrant) releaseFolderGrant(folderGrant)
          if (activeLoadController === controller) {
            activeLoadController = null
          }
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

        const result = await get().loadCatalog(bundledSource)
        const state = get()
        return (
          result.kind === 'applied' &&
          !state.error &&
          state.gameData !== null &&
          state.dataSourceConfig?.type === 'bundled' &&
          state.dataSourceConfig.packId === bundledSource.packId &&
          state.dataSourceConfig.packVersion === bundledSource.packVersion
        )
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
