import type {
  BundledDataSourceConfig,
  CatalogResourceProof,
  GameData,
  GameDataSourceStack,
} from '@/types/5etools'
import type { PreparedCatalog } from './catalogCandidate'
import { type CatalogComparisonBasis, compareCatalog } from './catalogComparison'
import type {
  CatalogCandidate,
  CatalogCommand,
  CatalogReply,
  CatalogSummary,
  CatalogWorkerMessage,
} from './catalogProtocol'
import type { DataLoaderOptions } from './dataLoader'
import { fetchObservedResource } from './resourceReader'

type Progress = DataLoaderOptions['onProgress']
interface PendingRequest {
  progress: Progress
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  reads: Map<number, AbortController>
}

const pending = new Map<string, PendingRequest>()
let unsubscribe: (() => void) | undefined

async function handleMessage(message: CatalogWorkerMessage) {
  if (message.kind === 'closed') {
    for (const request of pending.values())
      request.reject(new Error('Catalog worker stopped. Check the source again.'))
    return
  }
  const request = pending.get(message.id)
  if (!request) return

  switch (message.kind) {
    case 'progress':
      request.progress?.(message.current, message.total, message.resource)
      break
    case 'error':
      request.reject(new Error(message.error))
      break
    case 'result':
      request.resolve(message.result)
      break
    case 'cancel-read':
      request.reads.get(message.readId)?.abort()
      break
    case 'read': {
      if (message.request.kind !== 'remote') break
      const controller = new AbortController()
      request.reads.set(message.readId, controller)
      try {
        // Chromium still owns CORS, CSP, redirects and session policy. Parse only in the worker.
        const { url, observation } = message.request
        const result = observation
          ? await fetchObservedResource(url, observation, controller.signal)
          : { response: await fetch(url, { signal: controller.signal }), stamp: undefined }
        let reply: CatalogReply
        if ('unchanged' in result) reply = { unchanged: true }
        else {
          const { response, stamp } = result
          if (response.ok) reply = { bytes: await response.arrayBuffer(), stamp }
          else {
            void response.body?.cancel().catch(() => {})
            reply = { error: `HTTP ${response.status}`, status: response.status }
          }
        }
        if (!controller.signal.aborted)
          window.electronAPI.sendCatalogMessage({
            kind: 'read-result',
            id: message.id,
            readId: message.readId,
            reply,
          })
      } catch (error) {
        if (!controller.signal.aborted)
          window.electronAPI.sendCatalogMessage({
            kind: 'read-result',
            id: message.id,
            readId: message.readId,
            reply: { error: error instanceof Error ? error.message : String(error) },
          })
      } finally {
        request.reads.delete(message.readId)
      }
      break
    }
  }
}

export function hasCatalogWorker() {
  return typeof window.electronAPI?.sendCatalogMessage === 'function'
}

async function run<T>(
  command: CatalogCommand,
  signal: AbortSignal,
  progress?: Progress,
  retainedId?: string,
): Promise<T> {
  signal.throwIfAborted()
  const api = window.electronAPI
  const id = retainedId ?? crypto.randomUUID()
  unsubscribe ??= api.onCatalogMessage((message) => {
    void handleMessage(message)
  })
  const reads = new Map<number, AbortController>()
  let succeeded = false
  const abort = () => pending.get(id)?.reject(signal.reason)
  try {
    const result = await new Promise<T>((resolve, reject) => {
      pending.set(id, { progress, resolve: (value) => resolve(value as T), reject, reads })
      signal.addEventListener('abort', abort, { once: true })
      api.sendCatalogMessage({ kind: 'run', id, command })
    })
    signal.throwIfAborted()
    succeeded = true
    return result
  } finally {
    pending.delete(id)
    signal.removeEventListener('abort', abort)
    for (const controller of reads.values()) controller.abort()
    if (!retainedId || !succeeded) api.sendCatalogMessage({ kind: 'drop', id })
    if (!pending.size) {
      unsubscribe?.()
      unsubscribe = undefined
    }
  }
}

export function prepareCatalogCandidate(
  config: PreparedCatalog['config'],
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  progress?: Progress,
): Promise<CatalogCandidate>
export function prepareCatalogCandidate(
  config: PreparedCatalog['config'],
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  progress: Progress | undefined,
  verifiedRevision: string | CatalogResourceProof | undefined,
): Promise<CatalogCandidate | null>
export async function prepareCatalogCandidate(
  config: PreparedCatalog['config'],
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  progress?: Progress,
  verifiedRevision?: string | CatalogResourceProof,
): Promise<CatalogCandidate | null> {
  if (!hasCatalogWorker()) {
    if (import.meta.env.DESKTOP_CATALOG_WORKER) throw new Error('Catalog utility is unavailable.')
    const catalog = await import('./catalogCandidate')
    return verifiedRevision
      ? catalog.checkCatalogRevision(config, base, verifiedRevision, signal, progress)
      : catalog.prepareCatalog(config, base, signal, progress)
  }
  const workerId = crypto.randomUUID()
  const summary = await run<CatalogSummary | null>(
    { kind: 'prepare', config, base, verifiedRevision },
    signal,
    progress,
    workerId,
  )
  if (summary) return { ...summary, workerId }
  window.electronAPI.sendCatalogMessage({ kind: 'drop', id: workerId })
  return null
}

export function compareCatalogCandidate(
  candidate: CatalogCandidate,
  prior: CatalogComparisonBasis,
  signal: AbortSignal,
) {
  return 'workerId' in candidate
    ? run<ReturnType<typeof compareCatalog>>(
        { kind: 'compare', workerId: candidate.workerId, prior },
        signal,
      )
    : Promise.resolve(compareCatalog(candidate, prior))
}

export function materializeCatalogCandidate(candidate: CatalogCandidate, signal: AbortSignal) {
  return 'workerId' in candidate
    ? run<PreparedCatalog>({ kind: 'take', workerId: candidate.workerId }, signal)
    : Promise.resolve(candidate)
}

export function releaseCatalogCandidate(candidate?: CatalogCandidate) {
  if (candidate && 'workerId' in candidate)
    window.electronAPI.sendCatalogMessage({ kind: 'drop', id: candidate.workerId })
}

export function loadBundledCatalog(
  config: BundledDataSourceConfig,
  signal: AbortSignal,
  progress?: Progress,
) {
  return run<{ data: GameData; contentFingerprint: string; failed: number; required: number }>(
    { kind: 'bundled', config },
    signal,
    progress,
  )
}

export function repairCatalog(
  data: GameData,
  contentFingerprint: string | undefined,
  signal: AbortSignal,
) {
  return run<{ data: GameData; contentFingerprint: string }>(
    { kind: 'repair', data, contentFingerprint },
    signal,
  )
}
