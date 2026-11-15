import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// Most component and hook tests do not exercise persistence. Keep their storage boundary
// deterministic in one place; store-specific tests can override this module locally.
vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

// Local corpus fixtures inject their file reads. The desktop app uses the catalog worker.
vi.mock(import('@/lib/5etools/resourceReader'), async (importOriginal) => {
  const actual = await importOriginal()
  const createJsonResourceReader: typeof actual.createJsonResourceReader = (
    config,
    read,
    options,
  ) => {
    if (read || config.type === 'remote')
      return actual.createJsonResourceReader(config, read, options)
    const fixture: unknown = Reflect.get(globalThis, 'window')?.electronAPI
    const fileReads = fixture as
      | Partial<
          Record<
            'readBundledJson' | 'readLocalJson',
            (path: string, root?: string, probe?: boolean) => Promise<unknown>
          >
        >
      | undefined
    const readFile =
      config.type === 'bundled' ? fileReads?.readBundledJson : fileReads?.readLocalJson
    if (typeof readFile !== 'function')
      return actual.createJsonResourceReader(config, undefined, options)
    return actual.createJsonResourceReader(
      config,
      (request, signal) =>
        request.kind === 'remote'
          ? actual.readRemoteJson(request.url, signal)
          : request.kind === 'local'
            ? request.observation
              ? readFile(request.path, request.root, request.observation.probe)
              : readFile(request.path, request.root)
            : readFile(request.path),
      options,
    )
  }
  return { ...actual, createJsonResourceReader }
})

if (typeof window !== 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // Radix menus scroll the focused option into view; jsdom has no layout engine.
  HTMLElement.prototype.scrollIntoView = vi.fn()

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
