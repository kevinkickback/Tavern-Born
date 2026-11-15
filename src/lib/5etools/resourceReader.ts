import type { DataSourceConfig } from '@/types/5etools'
import { parseRemoteDataSourceUrl } from './urlUtils'

export const DATA_REQUEST_TIMEOUT_MS = 15_000

export interface JsonResourceReader {
  readonly type: DataSourceConfig['type']
  readJson(relativePath: string, signal?: AbortSignal): Promise<unknown>
}

export type JsonSourceRead =
  | { kind: 'remote'; url: string; observation?: ResourceReadOptions }
  | { kind: 'bundled'; path: string }
  | { kind: 'local'; path: string; root: string; observation?: ResourceReadOptions }

interface ResourceReadOptions {
  probe?: true
  stamp?: string
}

export type ResourceObservation =
  | { observed: true; stamp?: string; data: unknown }
  | { observed: true; stamp: string }
  | { observed: true; unchanged: true }

type ReadOptions = (path: string) => ResourceReadOptions

export type ReadSourceJson = (request: JsonSourceRead, signal?: AbortSignal) => Promise<unknown>

export class ResourceHttpError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`HTTP ${status} for ${path}`)
  }
}

export function isMissingCatalogResource(type: DataSourceConfig['type'], error: unknown): boolean {
  if (error instanceof ResourceHttpError) return error.status === 404 || error.status === 410
  return type !== 'remote' && error instanceof Error && /^(?:Error: )?ENOENT:/.test(error.message)
}

function normalizeJsonResourcePath(relativePath: string): string {
  const normalized = relativePath.trim()
  const segments = normalized.split('/')
  if (
    normalized.length === 0 ||
    normalized.includes('\\') ||
    normalized.startsWith('/') ||
    !normalized.toLowerCase().endsWith('.json') ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid JSON resource path: ${relativePath}`)
  }
  return normalized
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error && signal.reason.name === 'AbortError') throw signal.reason
  throw new DOMException('Data loading aborted', 'AbortError')
}

function createTimedSignal(parentSignal?: AbortSignal): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const abortFromParent = () =>
    controller.abort(
      parentSignal?.reason instanceof Error && parentSignal.reason.name === 'AbortError'
        ? parentSignal.reason
        : new DOMException('Data loading aborted', 'AbortError'),
    )
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Data request timed out', 'TimeoutError'))
  }, DATA_REQUEST_TIMEOUT_MS)

  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
  }
}

export function buildRemoteResourceUrl(baseUrl: string, relativePath: string): string {
  const normalizedPath = normalizeJsonResourcePath(relativePath)
  return `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}data/${normalizedPath.split('/').map(encodeURIComponent).join('/')}`
}

export async function readRemoteJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new ResourceHttpError(response.status, url)
  return response.json()
}

const isEntityTag = (value: string) => /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)
const isHttpDate = (value: string) =>
  /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value) &&
  Number.isFinite(Date.parse(value))

function getConditionalHeaders(stamp?: string): Headers | undefined {
  const value = stamp?.slice(1)
  if (value && value.length <= 1024) {
    if (stamp?.startsWith('e') && isEntityTag(value)) return new Headers({ 'If-None-Match': value })
    if (stamp?.startsWith('m') && isHttpDate(value))
      return new Headers({ 'If-Modified-Since': value })
  }
}

export async function fetchObservedResource(
  url: string,
  options: ResourceReadOptions,
  signal?: AbortSignal,
) {
  const headers = getConditionalHeaders(options.stamp)
  const fresh = { signal, cache: 'no-store' } as const
  if (headers) {
    try {
      const response = await fetch(url, { ...fresh, headers, redirect: 'error' })
      if (response.status === 304 && !response.redirected) return { unchanged: true } as const
      if (response.ok) return { response, stamp: getResponseStamp(response) }
      // Confirm even 404/410 with an ordinary GET. A host may reject conditional headers.
      void response.body?.cancel().catch(() => {})
    } catch {
      signal?.throwIfAborted()
    }
  }
  const response = await fetch(url, fresh)
  return { response, stamp: headers ? undefined : getResponseStamp(response) }
}

function getResponseStamp(response: Response): string | undefined {
  if (response.redirected) return
  const etag = response.headers?.get('etag')
  if (etag && etag.length <= 1024 && isEntityTag(etag)) return `e${etag}`
  const modified = response.headers?.get('last-modified')
  if (modified && modified.length <= 1024 && isHttpDate(modified)) return `m${modified}`
}

async function readBrowserRemote(
  request: Extract<JsonSourceRead, { kind: 'remote' }>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!request.observation) return readRemoteJson(request.url, signal)
  const result = await fetchObservedResource(request.url, request.observation, signal)
  if ('unchanged' in result)
    return { observed: true, unchanged: true } satisfies ResourceObservation
  const { response, stamp } = result
  if (!response.ok) {
    void response.body?.cancel().catch(() => {})
    throw new ResourceHttpError(response.status, request.url)
  }
  return { observed: true, stamp, data: await response.json() } satisfies ResourceObservation
}

const readBrowserJson: ReadSourceJson = (request, signal) =>
  request.kind === 'remote'
    ? readBrowserRemote(request, signal)
    : Promise.reject(new Error('Reading local catalog files requires the Electron catalog worker'))

function createBundledReader(read: ReadSourceJson): JsonResourceReader {
  return {
    type: 'bundled',
    async readJson(relativePath, signal) {
      throwIfAborted(signal)
      const result = await read(
        { kind: 'bundled', path: normalizeJsonResourcePath(relativePath) },
        signal,
      )
      throwIfAborted(signal)
      return result
    },
  }
}

function createLocalReader(
  basePath: string,
  read: ReadSourceJson,
  options?: ReadOptions,
): JsonResourceReader {
  return {
    type: 'local',
    async readJson(relativePath, signal) {
      throwIfAborted(signal)
      const normalizedPath = normalizeJsonResourcePath(relativePath)
      const separator = basePath.includes('\\') ? '\\' : '/'
      const separatorPrefix = basePath.endsWith(separator) ? '' : separator
      const fullPath = `${basePath}${separatorPrefix}${normalizedPath.split('/').join(separator)}`
      const result = await read(
        { kind: 'local', path: fullPath, root: basePath, observation: options?.(normalizedPath) },
        signal,
      )
      throwIfAborted(signal)
      return result
    },
  }
}

function createRemoteReader(
  path: string,
  read: ReadSourceJson,
  options?: ReadOptions,
): JsonResourceReader {
  const parsedUrl = parseRemoteDataSourceUrl(path)
  if (parsedUrl.kind === 'invalid') throw new Error(parsedUrl.error)
  const baseUrl = parsedUrl.normalizedUrl

  return {
    type: 'remote',
    async readJson(relativePath, signal) {
      const normalizedPath = normalizeJsonResourcePath(relativePath)
      const timedSignal = createTimedSignal(signal)
      try {
        return await read(
          {
            kind: 'remote',
            url: buildRemoteResourceUrl(baseUrl, normalizedPath),
            observation: options?.(normalizedPath),
          },
          timedSignal.signal,
        )
      } catch (error) {
        if (error instanceof ResourceHttpError)
          throw new ResourceHttpError(error.status, normalizedPath)
        throw error
      } finally {
        timedSignal.cleanup()
      }
    },
  }
}

export function createJsonResourceReader(
  config: DataSourceConfig,
  read: ReadSourceJson = readBrowserJson,
  options?: ReadOptions,
): JsonResourceReader {
  switch (config.type) {
    case 'bundled':
      return createBundledReader(read)
    case 'local':
      return createLocalReader(config.path, read, options)
    case 'remote':
      return createRemoteReader(config.path, read, options)
  }
}
