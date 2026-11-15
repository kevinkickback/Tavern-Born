import {
  checkCatalogRevision,
  type PreparedCatalog,
  prepareCatalog,
} from '@/lib/5etools/catalogCandidate'
import { compareCatalog } from '@/lib/5etools/catalogComparison'
import type {
  CatalogCommand,
  CatalogReply,
  CatalogRequestMessage,
  CatalogSummary,
  CatalogWorkerMessage,
} from '@/lib/5etools/catalogProtocol'
import { loadDataFromSource } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  createJsonResourceReader,
  type ReadSourceJson,
  ResourceHttpError,
  type ResourceObservation,
} from '@/lib/5etools/resourceReader'
import { settleOnAbort } from '@/lib/abortable'
import { computeGameDataFingerprint } from '@/lib/storage/dataCache'

const port = process.parentPort
if (!port) throw new Error('Catalog worker requires a parent process')
const send = (message: CatalogWorkerMessage) => port.postMessage(message)
const tasks = new Map<string, AbortController>()
const reads = new Map<number, { id: string; resolve: (reply: CatalogReply) => void }>()
const prepared = new Map<string, PreparedCatalog>()
let readId = 0

function getCandidate(id: string) {
  const result = prepared.get(id)
  if (!result) throw new Error('This catalog preview expired. Check the source again.')
  return result
}

async function run(id: string, command: CatalogCommand, signal: AbortSignal): Promise<unknown> {
  const onProgress = (current: number, total: number, resource: string) =>
    send({ kind: 'progress', id, current, total, resource })
  const read: ReadSourceJson = async (request, readSignal = signal) => {
    readSignal.throwIfAborted()
    const nextReadId = ++readId
    const pending = new Promise<CatalogReply>((resolve) => reads.set(nextReadId, { id, resolve }))
    try {
      send({ kind: 'read', id, readId: nextReadId, request })
      const reply = await settleOnAbort(pending, readSignal)
      if ('error' in reply) {
        if (reply.status)
          throw new ResourceHttpError(
            reply.status,
            request.kind === 'remote' ? request.url : request.path,
          )
        throw new Error(reply.error)
      }
      if ('unchanged' in reply)
        return { observed: true, unchanged: true } satisfies ResourceObservation
      if (!('text' in reply) && !('bytes' in reply))
        return { observed: true, stamp: reply.stamp } satisfies ResourceObservation
      const data = JSON.parse('text' in reply ? reply.text : new TextDecoder().decode(reply.bytes))
      if ('observation' in request && request.observation)
        return { observed: true, stamp: reply.stamp, data } satisfies ResourceObservation
      return data
    } finally {
      reads.delete(nextReadId)
      if (readSignal.aborted) send({ kind: 'cancel-read', id, readId: nextReadId })
    }
  }

  switch (command.kind) {
    case 'prepare': {
      const candidate = command.verifiedRevision
        ? await checkCatalogRevision(
            command.config,
            command.base,
            command.verifiedRevision,
            signal,
            onProgress,
            read,
          )
        : await prepareCatalog(command.config, command.base, signal, onProgress, read)
      signal.throwIfAborted()
      if (!candidate) return null
      const { data, keys: _keys, ...metadata } = candidate
      const contentFingerprint = computeGameDataFingerprint(data)
      prepared.set(id, candidate)
      return { ...metadata, contentFingerprint } satisfies CatalogSummary
    }
    case 'bundled': {
      const failed = new Set<string>()
      const required = new Set<string>()
      const data = await loadDataFromSource(
        command.config,
        {
          signal,
          onProgress,
          onResourceFailure: (path, failure) => {
            failed.add(path)
            if (failure.required) required.add(path)
          },
        },
        createJsonResourceReader(command.config, read),
      )
      signal.throwIfAborted()
      return {
        data,
        contentFingerprint: computeGameDataFingerprint(data),
        failed: failed.size,
        required: required.size,
      }
    }
    case 'repair': {
      const data = command.data.lookups
        ? command.data
        : { ...command.data, lookups: buildGameDataLookups(command.data) }
      return {
        data,
        contentFingerprint: command.contentFingerprint ?? computeGameDataFingerprint(data),
      }
    }
    case 'compare':
      return compareCatalog(getCandidate(command.workerId), command.prior)
    case 'take':
      return getCandidate(command.workerId)
  }
}

port.on('message', ({ data: message }: { data: CatalogRequestMessage }) => {
  if (message.kind === 'drop') {
    tasks.get(message.id)?.abort()
    prepared.delete(message.id)
    return
  }
  if (message.kind === 'read-result') {
    const pending = reads.get(message.readId)
    if (pending?.id === message.id) pending.resolve(message.reply)
    return
  }
  if (tasks.has(message.id) || prepared.has(message.id)) return
  const controller = new AbortController()
  tasks.set(message.id, controller)
  void run(message.id, message.command, controller.signal)
    .then(
      (result) => {
        if (!controller.signal.aborted) send({ kind: 'result', id: message.id, result })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          send({
            kind: 'error',
            id: message.id,
            error: error instanceof Error ? error.message : String(error),
          })
      },
    )
    .finally(() => tasks.delete(message.id))
})
