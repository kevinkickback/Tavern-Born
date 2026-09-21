import type { DataSourceConfig } from '@/types/5etools'
import { parseRemoteDataSourceUrl } from './urlUtils'

export const DATA_REQUEST_TIMEOUT_MS = 15_000

export interface JsonResourceReader {
  readonly type: DataSourceConfig['type']
  readJson(relativePath: string, signal?: AbortSignal): Promise<unknown>
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
  return `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}data/${normalizedPath}`
}

function createBundledReader(): JsonResourceReader {
  return {
    type: 'bundled',
    async readJson(relativePath, signal) {
      throwIfAborted(signal)
      const readBundledJson = window.electronAPI?.readBundledJson
      if (!readBundledJson) throw new Error('Bundled data loading requires Electron runtime')
      const result = await readBundledJson(normalizeJsonResourcePath(relativePath))
      throwIfAborted(signal)
      return result
    },
  }
}

function createLocalReader(basePath: string): JsonResourceReader {
  return {
    type: 'local',
    async readJson(relativePath, signal) {
      throwIfAborted(signal)
      const readLocalJson = window.electronAPI?.readLocalJson
      if (!readLocalJson) throw new Error('Local data loading requires Electron runtime')
      const normalizedPath = normalizeJsonResourcePath(relativePath)
      const separator = basePath.includes('\\') ? '\\' : '/'
      const separatorPrefix = basePath.endsWith(separator) ? '' : separator
      const fullPath = `${basePath}${separatorPrefix}${normalizedPath.split('/').join(separator)}`
      const result = await readLocalJson(fullPath)
      throwIfAborted(signal)
      return result
    },
  }
}

function createRemoteReader(path: string): JsonResourceReader {
  const parsedUrl = parseRemoteDataSourceUrl(path)
  if (parsedUrl.kind === 'invalid') throw new Error(parsedUrl.error)
  const baseUrl = parsedUrl.normalizedUrl

  return {
    type: 'remote',
    async readJson(relativePath, signal) {
      const normalizedPath = normalizeJsonResourcePath(relativePath)
      const timedSignal = createTimedSignal(signal)
      try {
        const response = await fetch(buildRemoteResourceUrl(baseUrl, normalizedPath), {
          signal: timedSignal.signal,
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch ${normalizedPath}: ${response.statusText}`)
        }
        return await response.json()
      } finally {
        timedSignal.cleanup()
      }
    },
  }
}

export function createJsonResourceReader(config: DataSourceConfig): JsonResourceReader {
  switch (config.type) {
    case 'bundled':
      return createBundledReader()
    case 'local':
      return createLocalReader(config.path)
    case 'remote':
      return createRemoteReader(config.path)
  }
}
