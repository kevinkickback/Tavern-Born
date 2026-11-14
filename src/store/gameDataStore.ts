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
  GAME_DATA_CACHE_SCHEMA_VERSION,
  GAME_DATA_SETTINGS_KEY,
  GAME_DATA_STORE_VERSION,
  type GameDataCacheMetadata,
  isCacheForSource,
  isPreviousCatalogCompatible,
  markCatalogChecked,
  type PreviousCatalog,
  persistCatalogRepair,
  readCatalogExpectation,
  readGameDataCachePair,
  restorePreviousCatalog,
  writeCatalogRefreshCheck,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import type { BundledDataSourceConfig, DataSourceConfig, GameData } from '@/types/5etools'

let activeLoadController: AbortController | null = null
let activeLoadRequestId = 0
let remoteStartupPreparation: AbortController | null = null
let cacheMutationQueue: Promise<void> = Promise.resolve()
const catalogWorkflows = new Set<symbol>()
const WORKFLOW_MESSAGE = 'Finish the character workflow or save or discard its edits first.'

function catalogIsProtected() {
  return catalogWorkflows.size > 0 || useGameDataStore.getState().catalogDraftDirty
}

function resumeCatalogRestore() {
  // Allow workflow cleanup and any replacement workflow's protection to settle first.
  queueMicrotask(() => {
    const state = useGameDataStore.getState()
    const pending = state.pendingCatalog
    if (
      !pending?.restoreWhenIdle ||
      activeLoadController ||
      state.isCatalogActivating ||
      catalogIsProtected()
    )
      return
    void state.loadCatalog(pending.candidate.config, false, {
      prepared: pending.candidate,
      confirmed: true,
    })
  })
}

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
  startupRecoverySource?: Exclude<DataSourceConfig, { type: 'bundled' }>
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
  isStartupRecovering: boolean
  isCatalogActivating: boolean
  catalogDraftDirty: boolean
  previousCatalog: PreviousCatalog | undefined
  cacheExpectation: GameDataCacheMetadata | null | undefined
  protectCatalog: () => () => void
  rollbackCatalog: () => Promise<boolean>
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
    expectedCache?: GameDataCacheMetadata | null
    reason: 'reload' | 'recovery' | 'update' | 'review'
    removals: string[]
    additions?: string[]
    incompleteRemovalPreview: boolean
    folderGrant?: string
    restoreWhenIdle?: true
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
      isStartupRecovering: false,
      isCatalogActivating: false,
      catalogDraftDirty: false,
      previousCatalog: undefined,
      cacheExpectation: undefined,
      protectCatalog: () => {
        const token = Symbol()
        catalogWorkflows.add(token)
        return () => {
          catalogWorkflows.delete(token)
          if (get().pendingCatalog?.restoreWhenIdle && !catalogIsProtected()) resumeCatalogRestore()
        }
      },
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
          state.isCatalogActivating ||
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
        if (
          remoteStartupPreparation ||
          get().isLoading ||
          get().isBackgroundRefreshing ||
          get().isCatalogActivating ||
          catalogWorkflows.size ||
          get().catalogDraftDirty
        )
          return {}
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
        if (pair) {
          set({
            cacheExpectation: pair.expectedCache,
            previousCatalog:
              pair.previous && isPreviousCatalogCompatible(pair.previous, installed)
                ? pair.previous
                : undefined,
          })
        }
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
        const savedCache = pair?.expectedCache ?? availableCache
        if (
          external &&
          savedCache?.sourceSnapshot?.type === external.type &&
          savedCache.sourceSnapshot.path === external.path
        ) {
          set({ externalKeys: savedCache.externalKeys })
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
              set({ cacheExpectation: cacheMetadata(entry) })
            } catch {
              return false
            } finally {
              clearTimeout(repairTimeout)
              if (remoteStartupPreparation === repairController) remoteStartupPreparation = null
            }
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
              startupRecoverySource:
                startup && opts?.checkForUpdates ? (external ?? undefined) : undefined,
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
        if (get().isStartupRecovering) set({ isStartupRecovering: false })
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
        const blocked = get().isCatalogActivating
          ? 'Game data is already being applied.'
          : !background && (catalogWorkflows.size || get().catalogDraftDirty)
            ? WORKFLOW_MESSAGE
            : undefined
        if (blocked) {
          if (request?.prepared !== pending?.candidate) releaseCatalogCandidate(request?.prepared)
          if (request?.folderGrant !== pending?.folderGrant)
            releaseFolderGrant(request?.folderGrant)
          return { kind: 'rejected', message: blocked }
        }
        const expectation = request?.confirmed ? pending?.expectedCache : get().cacheExpectation
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

        const rememberCheck = (
          succeeded: boolean,
          needsReview = false,
          checkExpectation = expectation,
        ) => {
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
          return writeCatalogRefreshCheck(check, checkExpectation).catch(() => undefined)
        }

        set({
          pendingCatalog: null,
          isLoading: !background,
          isBackgroundRefreshing: background,
          isStartupRecovering: Boolean(
            background && request?.startup && get().sessionBundledSource,
          ),
          error: null,
          loadProgress: null,
        })

        let candidate = request?.prepared
        try {
          const expectedCache =
            expectation === undefined && !request?.session
              ? await settleOnAbort(readCatalogExpectation(), signal)
              : expectation
          const finishUnchangedCheck = async (
            cached: GameDataCacheMetadata,
            checkedConfig: DataSourceConfig,
            warnings: string[],
          ) => {
            const now = new Date().toISOString()
            const result = await enqueueCacheMutation(async () => {
              signal.throwIfAborted()
              const generation = await markCatalogChecked(cached, checkedConfig, now, signal)
              if (!generation)
                throw new Error('The game data cache changed during the check. Try again.')
              set({
                cacheExpectation: { ...cached, generation },
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
            await rememberCheck(true, false, get().cacheExpectation)
            return result
          }
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
            const state = get()
            const base = state.bundledUnavailable
              ? null
              : await settleOnAbort(resolveDefaultBundledSource(), signal)
            const canRevalidate =
              background &&
              configured === config &&
              (!window.electronAPI?.getBundledManifest || base) &&
              !state.bundledUnavailable &&
              state.gameData &&
              !state.sessionBundledSource &&
              state.externalKeys?.length &&
              expectedCache?.cacheSchemaVersion === GAME_DATA_CACHE_SCHEMA_VERSION &&
              expectedCache.generation &&
              expectedCache.contentFingerprint?.length === 64 &&
              expectedCache.contentFingerprint === state.lastContentFingerprint &&
              isCacheForSource(expectedCache, base ? { base, additional: config } : config)
            const verifiedRevision = canRevalidate
              ? config.type === 'remote' &&
                config.verifiedRevision &&
                config.verifiedRevision === config.acceptedRevision &&
                /^[a-f\d]{40}$/i.test(config.verifiedRevision)
                ? config.verifiedRevision
                : config.resourceProof
              : undefined
            const prepared = await settleOnAbort(
              prepareCatalogCandidate(
                config,
                base ?? undefined,
                signal,
                loaderOptions.onProgress,
                verifiedRevision,
              ),
              signal,
            )
            if (prepared === null && expectedCache)
              return await finishUnchangedCheck(expectedCache, config, [])
            candidate = prepared ?? undefined
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
          if (candidate && get().isStartupRecovering)
            loaderOptions.onProgress?.(0, 0, 'Verifying rebuilt game data')
          const prior = get()
          const priorSource = prior.dataSourceConfig
          const hadExternal = priorSource && priorSource.type !== 'bundled'
          const sameSource =
            candidate &&
            priorSource?.type === candidate.config.type &&
            priorSource.path === candidate.config.path
          const sameSourceBaseline =
            sameSource &&
            ((!prior.sessionBundledSource && prior.lastContentFingerprint) ||
              prior.savedContentFingerprint)
          const unavailable = hadExternal
            ? candidate?.unavailableResources?.filter(
                (resource) =>
                  !priorSource.availableResources ||
                  priorSource.availableResources.includes(resource) ||
                  (resource.startsWith('class/fluff-class-') &&
                    priorSource.availableResources.includes('class/index.json')),
              )
            : undefined
          if (unavailable?.length) {
            throw new Error(
              `Some files could not be checked. Your current game data was kept. ${unavailable.join(', ')}`,
            )
          }
          const hasPriorExternalData =
            hadExternal &&
            (priorSource.lastLoaded || (prior.gameData && !prior.sessionBundledSource))
          const { additions, removals, incompleteRemovalPreview, sameExternalKeys } =
            candidate && !request?.confirmed
              ? await compareCatalogCandidate(
                  candidate,
                  {
                    config: priorSource,
                    externalKeys: prior.externalKeys,
                    hasExternalData: Boolean(hasPriorExternalData),
                  },
                  signal,
                )
              : {
                  additions: [],
                  removals: [],
                  incompleteRemovalPreview: false,
                  sameExternalKeys: false,
                }
          if (candidate && 'workerId' in candidate)
            contentFingerprint = candidate.contentFingerprint
          const candidateFingerprint =
            candidate &&
            !request?.confirmed &&
            (background || incompleteRemovalPreview || sameSourceBaseline)
              ? 'workerId' in candidate
                ? candidate.contentFingerprint
                : computeGameDataFingerprint(candidate.data)
              : undefined
          const fingerprintMatches = candidateFingerprint === prior.lastContentFingerprint
          const cached = expectedCache
          const layerMetadata = candidate?.layerMetadata
          const sameLayers =
            !!cached?.sourceSnapshot &&
            (cached.sourceSnapshot.layers ?? []).every(
              (layer) =>
                layer.contentFingerprint === layerMetadata?.[layer.role]?.contentFingerprint &&
                layer.entityCount === layerMetadata?.[layer.role]?.entityCount,
            )
          const externalInventoryChanged =
            background &&
            hadExternal &&
            ((prior.externalKeys !== undefined && !sameExternalKeys) ||
              (!!cached && (!sameLayers || !isCacheForSource(cached, cacheIdentity))))
          const recovering = !!prior.sessionBundledSource || !!request?.recovery
          const verifiedRestore = Boolean(
            candidate &&
              recovering &&
              sameSource &&
              /^[a-f\d]{64}$/i.test(candidateFingerprint ?? '') &&
              candidateFingerprint === prior.savedContentFingerprint &&
              candidateFingerprint === cached?.contentFingerprint &&
              priorSource?.availableResources &&
              candidate.config.availableResources &&
              !candidate.warnings.length &&
              !candidate.unavailableResources?.length &&
              !additions.length &&
              !removals.length &&
              !incompleteRemovalPreview &&
              sameExternalKeys &&
              sameLayers &&
              cached?.generation &&
              isCacheForSource(cached, cacheIdentity) &&
              cached.sourceSnapshot.layers?.every(
                (layer) => layer.contentFingerprint && layer.entityCount !== undefined,
              ) !== false,
          )
          const restoring = verifiedRestore || (request?.confirmed && pending?.restoreWhenIdle)
          const stageCatalog = async (review: NonNullable<GameDataState['pendingCatalog']>) => {
            const recorded = rememberCheck(true, true, expectedCache)
            set({
              pendingCatalog: review,
              isLoading: false,
              isBackgroundRefreshing: false,
              isStartupRecovering: false,
              loadProgress: null,
              lastUpdateCheckAt: new Date().toISOString(),
              catalogWarnings: review.candidate.warnings,
            })
            await recorded
            return { kind: 'staged' } as const
          }
          if (
            candidate &&
            !request?.confirmed &&
            !verifiedRestore &&
            (recovering ||
              removals.length ||
              incompleteRemovalPreview ||
              (background && (!fingerprintMatches || externalInventoryChanged)) ||
              (sameSourceBaseline && candidateFingerprint !== sameSourceBaseline))
          ) {
            if (requestId !== activeLoadRequestId) return { kind: 'superseded' }
            const reason =
              removals.length ||
              (!recovering &&
                (!fingerprintMatches || externalInventoryChanged) &&
                !candidate.warnings.length)
                ? 'update'
                : recovering && sameSource
                  ? 'recovery'
                  : 'review'
            return await stageCatalog({
              candidate,
              expectedCache,
              reason,
              additions,
              removals,
              incompleteRemovalPreview,
              ...(folderGrant ? { folderGrant } : {}),
            })
          }

          if (requestId !== activeLoadRequestId) return { kind: 'superseded' }
          signal.throwIfAborted()
          if (
            candidate &&
            background &&
            prior.gameData &&
            !prior.sessionBundledSource &&
            cached &&
            cached.contentFingerprint === candidateFingerprint &&
            sameExternalKeys &&
            sameLayers &&
            isCacheForSource(cached, cacheIdentity)
          ) {
            const checkedConfig = {
              ...candidate.config,
              acceptedRevision: candidate.revision,
              verifiedRevision: candidate.warnings.length ? undefined : candidate.revision,
              lastLoaded: priorSource?.lastLoaded,
            }
            return await finishUnchangedCheck(cached, checkedConfig, candidate.warnings)
          }
          const prepared = candidate
            ? await materializeCatalogCandidate(candidate, signal)
            : undefined
          const acceptedData = prepared?.data ?? data
          if (!acceptedData || (config.type === 'bundled' && !hasCatalogRecords(acceptedData)))
            throw new Error('The Included SRD could not be loaded.')
          if (request?.session && config.type === 'bundled') {
            if (catalogWorkflows.size || get().catalogDraftDirty) throw new Error(WORKFLOW_MESSAGE)
            set({
              gameData: acceptedData,
              remoteStartup: null,
              sessionBundledSource: config,
              isStartupRecovering: Boolean(
                request.startupRecoverySource &&
                  isCatalogCheckDue(
                    request.startupRecoverySource,
                    get().catalogRefreshCheck,
                    get().lastUpdateCheckAt,
                    true,
                    Date.now(),
                  ),
              ),
              bundledUnavailable: false,
              cacheStatus: 'session-srd',
              isLoading: false,
              loadProgress: null,
            })
            return { kind: 'applied', changed: true }
          }

          const now = new Date().toISOString()
          const acceptedConfig = candidate
            ? {
                ...candidate.config,
                acceptedRevision: candidate.revision,
                verifiedRevision: candidate.warnings.length ? undefined : candidate.revision,
                lastLoaded: now,
              }
            : { ...config, isValid: true, lastLoaded: now }
          // Persist parsed data to IDB cache so next launch is instant.
          // Pass the last known fingerprint so writeGameDataCache can detect
          // unchanged content even when the IDB cache was cleared.
          const prevChangedAt = restoring
            ? (expectedCache?.lastDataChangedAt ?? expectedCache?.cachedAt)
            : get().lastDataChangedAt
          const prevFingerprint = restoring
            ? prior.savedContentFingerprint
            : get().lastContentFingerprint
          const hadGameData = get().gameData !== null
          let writeStarted = false
          const mutation = enqueueCacheMutation(async () => {
            if (requestId !== activeLoadRequestId) return { kind: 'superseded' } as const
            signal.throwIfAborted()
            if (catalogIsProtected()) {
              if (verifiedRestore && candidate)
                return stageCatalog({
                  candidate,
                  expectedCache,
                  reason: 'reload',
                  incompleteRemovalPreview: false,
                  removals: [],
                  restoreWhenIdle: true,
                })
              if (pending?.candidate === candidate && pending)
                set({ pendingCatalog: pending, catalogWarnings: pending.candidate.warnings })
              throw new Error(WORKFLOW_MESSAGE)
            }
            set({ isCatalogActivating: true })
            try {
              if (config.type === 'local')
                await settleOnAbort(
                  Promise.resolve(window.electronAPI?.approveLocalDataRoot?.(config.path)),
                  signal,
                )
              writeStarted = true
              let previousCatalog = get().previousCatalog
              const cacheEntry = await writeGameDataCache(acceptedData, cacheIdentity, {
                fingerprint: prevFingerprint,
                lastDataChangedAt: prevChangedAt,
                layerMetadata: candidate?.layerMetadata,
                signal,
                config: acceptedConfig,
                externalKeys: prepared?.keys,
                expectedCache,
                onPrevious: (previous) => {
                  previousCatalog = previous
                },
                ...(expectedCache !== undefined
                  ? {
                      contentFingerprint: restoring
                        ? (prevFingerprint ?? undefined)
                        : contentFingerprint,
                      previous: expectedCache,
                    }
                  : {}),
              })

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
                  ? {
                      isLoading: false,
                      isBackgroundRefreshing: false,
                      isStartupRecovering: false,
                      loadProgress: null,
                    }
                  : {}),
                lastDataChangedAt: cacheEntry.lastDataChangedAt ?? now,
                lastContentFingerprint: cacheEntry.contentFingerprint ?? null,
                lastUpdateCheckAt: now,
                catalogRefreshCheck: undefined,
                cacheStatus: 'fetched',
                remoteStartup: null,
                bundledUnavailable: config.type !== 'bundled' && get().bundledUnavailable,
                sessionBundledSource: null,
                savedContentFingerprint: cacheEntry.contentFingerprint ?? null,
                previousCatalog,
                cacheExpectation:
                  expectedCache === undefined ? undefined : cacheMetadata(cacheEntry),
              })
              return { kind: 'applied', changed: contentChanged } as const
            } finally {
              set({ isCatalogActivating: false })
            }
          })
          const result = await settleOnAbort(mutation, signal, () => !writeStarted)
          if (result.kind === 'applied') await rememberCheck(true, false, get().cacheExpectation)
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
              isStartupRecovering: false,
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
            isStartupRecovering: false,
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
            if (get().pendingCatalog?.restoreWhenIdle && !catalogIsProtected())
              resumeCatalogRestore()
          }
        }
      },

      rollbackCatalog: async () => {
        const previous = get().previousCatalog
        if (!previous || get().isLoading || get().isCatalogActivating) return false
        if (catalogWorkflows.size || get().catalogDraftDirty) {
          set({ error: WORKFLOW_MESSAGE })
          return false
        }
        const controller = new AbortController()
        const { signal } = controller
        const timer = setTimeout(
          () => controller.abort(catalogTimeout(INTERACTIVE_CATALOG_TIMEOUT_MS)),
          INTERACTIVE_CATALOG_TIMEOUT_MS,
        )
        set({ isCatalogActivating: true, error: null })
        activeLoadController?.abort()
        try {
          return await enqueueCacheMutation(async () => {
            const installed = await settleOnAbort(resolveDefaultBundledSource(), signal)
            const { config } = previous
            if (!isPreviousCatalogCompatible(previous, installed))
              throw new Error(
                'The previous game data is incompatible with this copy of Tavern Born.',
              )
            const entry = await restorePreviousCatalog(
              previous,
              get().cacheExpectation ?? null,
              signal,
            )
            const cacheExpectation = cacheMetadata(entry)
            const fingerprint =
              entry.contentFingerprint?.length === 64
                ? entry.contentFingerprint
                : computeGameDataFingerprint(entry.data)
            const pending = get().pendingCatalog
            releaseCatalogCandidate(pending?.candidate)
            releaseFolderGrant(pending?.folderGrant)
            set({
              gameData: entry.data.lookups
                ? entry.data
                : { ...entry.data, lookups: buildGameDataLookups(entry.data) },
              dataSourceConfig: config,
              previousCatalog: undefined,
              savedContentFingerprint: fingerprint,
              lastContentFingerprint: fingerprint,
              lastDataChangedAt: entry.lastDataChangedAt ?? entry.cachedAt,
              lastUpdateCheckAt: previous.lastCheckedAt ?? entry.cachedAt,
              externalKeys: entry.externalKeys,
              catalogRefreshCheck: undefined,
              pendingCatalog: null,
              catalogWarnings: [],
              isBackgroundRefreshing: false,
              loadProgress: null,
              sessionBundledSource: null,
              bundledUnavailable:
                config.type !== 'bundled' &&
                window.electronAPI?.getBundledManifest !== undefined &&
                !installed,
              remoteStartup: null,
              cacheStatus: 'cached',
              cacheExpectation,
            })
            return true
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Could not restore previous game data.',
          })
          return false
        } finally {
          clearTimeout(timer)
          set({ isCatalogActivating: false })
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

useGameDataStore.subscribe((state, previous) => {
  if (
    previous.catalogDraftDirty &&
    !state.catalogDraftDirty &&
    state.pendingCatalog?.restoreWhenIdle
  )
    resumeCatalogRestore()
})
