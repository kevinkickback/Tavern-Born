import type { DataSourceConfig } from '@/types/5etools'
import { parseRemoteDataSourceUrl } from './urlUtils'

export const DATA_REQUEST_TIMEOUT_MS = 15_000

export interface JsonResourceReader {
  readonly type: DataSourceConfig['type']
  readJson(relativePath: string, signal?: AbortSignal): Promise<unknown>
}

export type JsonSourceRead =
  | { kind: 'remote'; url: string }
  | { kind: 'bundled'; path: string }
  | { kind: 'local'; path: string; root: string }

export type ReadSourceJson = (request: JsonSourceRead, signal?: AbortSignal) => Promise<unknown>

export class ResourceHttpError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`HTTP ${status} for ${path}`)
  }
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

const readBrowserJson: ReadSourceJson = (request, signal) =>
  request.kind === 'remote'
    ? readRemoteJson(request.url, signal)
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

function createLocalReader(basePath: string, read: ReadSourceJson): JsonResourceReader {
  return {
    type: 'local',
    async readJson(relativePath, signal) {
      throwIfAborted(signal)
      const normalizedPath = normalizeJsonResourcePath(relativePath)
      const separator = basePath.includes('\\') ? '\\' : '/'
      const separatorPrefix = basePath.endsWith(separator) ? '' : separator
      const fullPath = `${basePath}${separatorPrefix}${normalizedPath.split('/').join(separator)}`
      const result = await read({ kind: 'local', path: fullPath, root: basePath }, signal)
      throwIfAborted(signal)
      return result
    },
  }
}

function createRemoteReader(path: string, read: ReadSourceJson): JsonResourceReader {
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
          { kind: 'remote', url: buildRemoteResourceUrl(baseUrl, normalizedPath) },
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
): JsonResourceReader {
  switch (config.type) {
    case 'bundled':
      return createBundledReader(read)
    case 'local':
      return createLocalReader(config.path, read)
    case 'remote':
      return createRemoteReader(config.path, read)
  }
}
