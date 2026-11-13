import { utilityProcess, type WebContents } from 'electron'
import type {
  CatalogReply,
  CatalogRequestMessage,
  CatalogWorkerMessage,
} from '@/lib/5etools/catalogProtocol'
import type { JsonSourceRead } from '@/lib/5etools/resourceReader'

type LocalRead = Exclude<JsonSourceRead, { kind: 'remote' }>

export function createCatalogService(
  owner: WebContents,
  entry: string,
  readFile: (
    request: LocalRead,
  ) => Promise<Extract<CatalogReply, { text: string } | { stamp: string }>>,
  authorizeLocal: (root: string) => () => void,
) {
  const child = utilityProcess.fork(entry, [], { serviceName: 'Tavern Born Catalog' })
  const jobs = new Map<string, { root?: string; verify?: () => void }>()
  const remoteReads = new Map<number, string>()
  let closed = false
  const send = (message: CatalogWorkerMessage) => {
    if (!owner.isDestroyed()) owner.send('catalog:event', message)
  }
  child.on('message', (message: CatalogWorkerMessage) => {
    if (closed || !('id' in message)) return
    const job = jobs.get(message.id)
    if (!job) return
    if (message.kind === 'read' && message.request.kind === 'remote')
      remoteReads.set(message.readId, message.id)
    if (message.kind === 'cancel-read') remoteReads.delete(message.readId)
    if (message.kind !== 'read' || message.request.kind === 'remote') {
      send(message)
      return
    }

    const reply = (value: CatalogReply) => {
      if (!closed && jobs.has(message.id))
        child.postMessage({
          kind: 'read-result',
          id: message.id,
          readId: message.readId,
          reply: value,
        } satisfies CatalogRequestMessage)
    }
    const request = message.request
    const readAuthorized = async () => {
      job.verify?.()
      if (request.kind === 'local' && request.root !== job.root)
        throw new Error('The catalog request is outside its data directory.')
      const result = await readFile(request)
      job.verify?.()
      return result
    }
    void readAuthorized().then(reply, (error: unknown) =>
      reply({ error: error instanceof Error ? error.message : String(error) }),
    )
  })
  child.on('exit', () => {
    if (closed) return
    closed = true
    send({ kind: 'closed' })
  })
  return {
    get closed() {
      return closed
    },
    close() {
      if (closed) return
      closed = true
      jobs.clear()
      remoteReads.clear()
      child.kill()
    },
    receive(message: CatalogRequestMessage) {
      if (closed) throw new Error('Catalog worker stopped. Check the source again.')
      if (message.kind === 'run') {
        if (jobs.has(message.id) || jobs.size >= 8)
          throw new Error('Too many active catalog requests.')
        const command = message.command
        if (command.kind === 'compare' || command.kind === 'take')
          jobs.get(command.workerId)?.verify?.()
        const root =
          command.kind === 'prepare' && command.config.type === 'local'
            ? command.config.path
            : undefined
        jobs.set(message.id, root ? { root, verify: authorizeLocal(root) } : {})
      } else if (message.kind === 'drop') {
        if (!jobs.delete(message.id)) return
        for (const [readId, id] of remoteReads) if (id === message.id) remoteReads.delete(readId)
      } else if (message.kind === 'read-result') {
        if (remoteReads.get(message.readId) !== message.id) return
        remoteReads.delete(message.readId)
      } else return
      child.postMessage(message)
    },
  }
}
