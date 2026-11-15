import { afterEach, expect, test, vi } from 'vitest'
import { prepareCatalogCandidate } from '@/lib/5etools/catalogClient'
import type { CatalogRequestMessage, CatalogWorkerMessage } from '@/lib/5etools/catalogProtocol'
import { clearGameDataCache, readGameDataCachePair } from '@/lib/storage/dataCache'
import { useGameDataStore } from '@/store/gameDataStore'
import type { CatalogResourceProof } from '@/types/5etools'

const source = { type: 'remote', path: 'https://example.test/rules', isValid: true } as const
const initial = useGameDataStore.getState()

afterEach(async () => {
  vi.unstubAllGlobals()
  useGameDataStore.setState(initial)
  await clearGameDataCache(true)
})

function installSource() {
  const documents = new Map<string, { body: unknown; etag: string }>([
    ['spells/index.json', { body: { PHB: 'spells-phb.json' }, etag: '"spells"' }],
    [
      'spells/spells-phb.json',
      { body: { spell: [{ name: 'Original Spell', source: 'PHB', level: 1 }] }, etag: '"a"' },
    ],
    ['feats.json', { body: { feat: [{ name: 'Test Feat', source: 'PHB' }] }, etag: '"feat"' }],
  ])
  const modified = 'Wed, 21 Oct 2015 07:28:00 GMT'
  let conditionalFailure: 'network' | 'not-found' | undefined
  let bytes = 0
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = url.slice(source.path.length + 6)
    const document = documents.get(path)
    if (!document) return Promise.resolve(new Response(null, { status: 404 }))
    const headers = new Headers(init?.headers)
    const condition = headers.get('If-None-Match') ?? headers.get('If-Modified-Since')
    if (condition && conditionalFailure === 'network')
      return Promise.reject(new TypeError('Failed to fetch'))
    if (condition && conditionalFailure === 'not-found')
      return Promise.resolve(new Response(null, { status: 404 }))
    if (condition && condition === (document.etag || modified))
      return Promise.resolve(new Response(null, { status: 304 }))
    const body = JSON.stringify(document.body)
    bytes += Buffer.byteLength(body)
    return Promise.resolve(
      new Response(body, {
        headers: document.etag ? { ETag: document.etag } : { 'Last-Modified': modified },
      }),
    )
  })
  vi.stubGlobal('fetch', fetch)
  return {
    documents,
    fetch,
    getBytes: () => bytes,
    denyConditional: (failure: typeof conditionalFailure) => {
      conditionalFailure = failure
    },
  }
}

const check = () => {
  const state = useGameDataStore.getState()
  return state.loadCatalog(state.dataSourceConfig!, true)
}

function oversizedResponse(cancel?: () => void) {
  const chunk = new Uint8Array(1024 * 1024)
  let remaining = 54
  return new Response(
    new ReadableStream({
      pull(controller) {
        controller.enqueue(chunk)
        if (--remaining === 0) controller.close()
      },
      cancel,
    }),
  )
}

test.each([
  { status: 304, reply: { unchanged: true } },
  { status: 200, reply: { error: 'Remote JSON resource exceeds the 50 MiB size limit' } },
])('the desktop renderer reports a $status response to the catalog worker', async ({
  status,
  reply,
}) => {
  let receive: ((message: CatalogWorkerMessage) => void) | undefined
  const path = `${source.path}/data/feats.json`
  const proof: CatalogResourceProof = { kind: 'remote', entries: [['feats.json', 'e"one"']] }
  const cancel = vi.fn()
  const response = status === 304 ? new Response(null, { status }) : oversizedResponse(cancel)
  const fetch = vi.fn(() => Promise.resolve(response))
  vi.stubGlobal('fetch', fetch)
  const sendCatalogMessage = vi.fn((message: CatalogRequestMessage) => {
    if (message.kind === 'run')
      receive?.({
        kind: 'read',
        id: message.id,
        readId: 1,
        request: { kind: 'remote', url: path, observation: { probe: true, stamp: 'e"one"' } },
      })
    if (message.kind === 'read-result') receive?.({ kind: 'result', id: message.id, result: null })
  })
  vi.stubGlobal('electronAPI', {
    sendCatalogMessage,
    onCatalogMessage: (listener: typeof receive) => {
      receive = listener
      return () => {
        receive = undefined
      }
    },
  })
  await expect(
    prepareCatalogCandidate(source, undefined, new AbortController().signal, undefined, proof),
  ).resolves.toBeNull()
  expect(sendCatalogMessage.mock.calls.map(([message]) => message.kind)).toEqual([
    'run',
    'read-result',
    'drop',
  ])
  expect(sendCatalogMessage.mock.calls[1][0]).toEqual(expect.objectContaining({ reply }))
  expect(cancel).toHaveBeenCalledTimes(status === 304 ? 0 : 1)
  expect(fetch).toHaveBeenCalledWith(
    path,
    expect.objectContaining({ headers: new Headers({ 'If-None-Match': '"one"' }) }),
  )
})

test('an oversized configured resource leaves the previously accepted catalog active', async () => {
  const { fetch } = installSource()
  const originalFetch = fetch.getMockImplementation()!
  expect(await useGameDataStore.getState().loadCatalog(source)).toMatchObject({ kind: 'applied' })
  const active = useGameDataStore.getState().gameData
  const pair = await readGameDataCachePair()

  fetch.mockImplementation((url, options) =>
    url.endsWith('/spells/spells-phb.json')
      ? Promise.resolve(oversizedResponse())
      : originalFetch(url, options),
  )
  expect(await check()).toMatchObject({
    kind: 'rejected',
    message: expect.stringContaining('50 MiB size limit'),
  })
  expect(useGameDataStore.getState().gameData).toBe(active)
  const afterFailure = await readGameDataCachePair()
  expect(afterFailure.cache).toEqual(pair.cache)
  expect(afterFailure.settings).toEqual(pair.settings)
  expect(afterFailure.refreshCheck?.consecutiveFailures).toBe(1)

  fetch.mockImplementation(originalFetch)
  expect(await check()).toEqual({ kind: 'applied', changed: false })
})

test('conditional HTTPS check preserves the cache and stages an edited indexed child for manual Apply', async () => {
  const { documents, fetch, getBytes } = installSource()
  const { loadCatalog, loadFromCache } = useGameDataStore.getState()
  documents.get('feats.json')!.etag = ''
  expect(await loadCatalog(source)).toMatchObject({ kind: 'applied' })
  const pair = await readGameDataCachePair()
  await loadFromCache()
  const active = useGameDataStore.getState().gameData

  const fullBytes = getBytes()
  expect(fullBytes).toBeGreaterThan(0)
  fetch.mockClear()
  expect(await check()).toEqual({ kind: 'applied', changed: false })
  expect(getBytes()).toBe(fullBytes)
  expect(fetch).toHaveBeenCalledWith(
    `${source.path}/data/feats.json`,
    expect.objectContaining({
      cache: 'no-store',
      headers: new Headers({ 'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT' }),
    }),
  )
  const child = 'spells/spells-phb.json'
  expect(fetch).toHaveBeenCalledWith(
    `${source.path}/data/${child}`,
    expect.objectContaining({ headers: new Headers({ 'If-None-Match': '"a"' }) }),
  )
  expect((await readGameDataCachePair()).cache).toEqual(pair.cache)

  fetch.mockClear()
  documents.set(child, {
    body: { spell: [{ name: 'Updated Spell', source: 'PHB', level: 1 }] },
    etag: '"b"',
  })
  expect(await check()).toEqual({ kind: 'staged' })
  expect(fetch.mock.calls.filter(([url]) => url.endsWith(child))).toHaveLength(1)
  expect(useGameDataStore.getState().gameData).toBe(active)
  expect((await readGameDataCachePair()).cache).toEqual(pair.cache)
  const { candidate } = useGameDataStore.getState().pendingCatalog!
  expect(
    await loadCatalog(candidate.config, false, { prepared: candidate, confirmed: true }),
  ).toMatchObject({ kind: 'applied' })
  expect(useGameDataStore.getState().gameData?.spells[0].name).toBe('Updated Spell')
})

test('records missing HTTPS hashes during an unchanged check without replacing the cache', async () => {
  const { getBytes } = installSource()
  const { loadCatalog } = useGameDataStore.getState()
  expect(await loadCatalog(source)).toMatchObject({ kind: 'applied' })
  const { cache } = await readGameDataCachePair()
  const config = useGameDataStore.getState().dataSourceConfig
  if (config?.type !== 'remote' || !config.resourceProof) throw new Error('Missing HTTPS proof')
  useGameDataStore.setState({
    dataSourceConfig: {
      ...config,
      resourceProof: {
        kind: 'remote',
        entries: config.resourceProof.entries.map(([path, stamp]) => [
          path,
          stamp?.replace(/#[a-f\d]{64}$/, '') ?? null,
        ]),
      },
    },
  })
  const bytes = getBytes()
  expect(await check()).toEqual({ kind: 'applied', changed: false })
  expect(getBytes()).toBeGreaterThan(bytes)
  const refreshed = await readGameDataCachePair()
  expect(refreshed.cache).toEqual(cache)
  const accepted = refreshed.settings?.dataSourceConfig
  expect(accepted?.type === 'remote' && accepted.resourceProof?.entries).toContainEqual([
    'feats.json',
    expect.stringMatching(/^e"feat"#[a-f\d]{64}$/),
  ])
})

test.each([
  'network',
  'not-found',
] as const)('falls back after a %s conditional failure and detects a newly present resource', async (failure) => {
  const { documents, denyConditional, fetch } = installSource()
  expect(await useGameDataStore.getState().loadCatalog(source)).toMatchObject({ kind: 'applied' })
  const pair = await readGameDataCachePair()
  denyConditional(failure)
  fetch.mockClear()
  expect(await check()).toEqual({ kind: 'applied', changed: false })
  expect(fetch.mock.calls.some(([, init]) => new Headers(init?.headers).has('If-None-Match'))).toBe(
    true,
  )
  const config = (await readGameDataCachePair()).settings?.dataSourceConfig
  expect(config?.type === 'remote' && config.resourceProof?.entries).toContainEqual([
    'spells/index.json',
    expect.stringMatching(/^#[a-f\d]{64}$/),
  ])

  documents.set('languages.json', {
    body: { language: [{ name: 'Test language', source: 'PHB' }] },
    etag: '"new"',
  })
  expect(await check()).toEqual({ kind: 'staged' })
  expect((await readGameDataCachePair()).cache).toEqual(pair.cache)
})
