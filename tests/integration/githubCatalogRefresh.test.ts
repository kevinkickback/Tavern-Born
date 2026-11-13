import { afterEach, expect, test, vi } from 'vitest'
import { prepareCatalogCandidate } from '@/lib/5etools/catalogClient'
import type { CatalogRequestMessage, CatalogWorkerMessage } from '@/lib/5etools/catalogProtocol'
import {
  clearGameDataCache,
  readGameDataCachePair,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { useGameDataStore } from '@/store/gameDataStore'

const source = { type: 'remote', path: 'https://github.com/example/rules', isValid: true } as const
const initial = useGameDataStore.getState()
const original = 'a'.repeat(40)
const changed = 'b'.repeat(40)

test('releases the desktop worker job when a revision check returns no candidate', async () => {
  let receive: ((message: CatalogWorkerMessage) => void) | undefined
  const sendCatalogMessage = vi.fn((message: CatalogRequestMessage) => {
    if (message.kind === 'run') receive?.({ kind: 'result', id: message.id, result: null })
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
  const signal = new AbortController().signal
  await expect(
    prepareCatalogCandidate(source, undefined, signal, undefined, original),
  ).resolves.toBeNull()
  const [[run], [drop]] = sendCatalogMessage.mock.calls
  expect(run).toMatchObject({
    kind: 'run',
    command: { kind: 'prepare', verifiedRevision: original },
  })
  expect(drop).toEqual({ kind: 'drop', id: run.id })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  useGameDataStore.setState(initial)
  await clearGameDataCache(true)
})

function stubGitHub() {
  let revision = original
  let warning = false
  const fetch = vi.fn((url: string) => {
    if (url === 'https://api.github.com/repos/example/rules')
      return Promise.resolve(Response.json({ default_branch: 'main' }))
    if (url === 'https://api.github.com/repos/example/rules/commits/main')
      return Promise.resolve(Response.json({ sha: revision }))
    const primary = revision === original ? 'Original Feat' : 'Updated Feat'
    const dataRoot = `https://raw.githubusercontent.com/example/rules/${revision}/data/`
    if (url === `${dataRoot}feats.json`)
      return Promise.resolve(Response.json({ feat: [{ name: primary, source: 'PHB' }] }))
    const status = warning && url === `${dataRoot}fluff-races.json` ? 503 : 404
    return Promise.resolve(new Response(null, { status }))
  })
  vi.stubGlobal('fetch', fetch)
  return {
    fetch,
    setRevision: (value: string) => {
      revision = value
    },
    setWarning: (value: boolean) => {
      warning = value
    },
  }
}

test('skips GitHub resource reads for the same verified SHA and stages a changed SHA', async () => {
  const github = stubGitHub()
  const { loadCatalog, loadFromCache } = useGameDataStore.getState()
  expect(await loadCatalog(source)).toMatchObject({ kind: 'applied' })
  const pair = await readGameDataCachePair()
  expect(pair.settings?.dataSourceConfig).toMatchObject({
    acceptedRevision: original,
    verifiedRevision: original,
  })
  expect(github.fetch.mock.calls.some(([url]) => url.includes('raw.githubusercontent.com'))).toBe(
    true,
  )
  await loadFromCache()
  const active = useGameDataStore.getState().gameData

  github.fetch.mockClear()
  expect(await loadCatalog(useGameDataStore.getState().dataSourceConfig!, true)).toEqual({
    kind: 'applied',
    changed: false,
  })
  expect(github.fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://api.github.com/repos/example/rules',
    'https://api.github.com/repos/example/rules/commits/main',
  ])
  expect(useGameDataStore.getState().gameData).toBe(active)
  expect((await readGameDataCachePair()).cache).toEqual(pair.cache)
  expect((await readGameDataCachePair()).previous).toBeUndefined()

  github.setRevision(changed)
  github.fetch.mockClear()
  expect(await loadCatalog(useGameDataStore.getState().dataSourceConfig!, true)).toEqual({
    kind: 'staged',
  })
  expect(github.fetch.mock.calls.filter(([url]) => url.includes('/commits/'))).toHaveLength(1)
  expect(github.fetch.mock.calls.some(([url]) => url.includes(`/${changed}/data/feats.json`))).toBe(
    true,
  )
  expect((await readGameDataCachePair()).cache).toEqual(pair.cache)
  const { candidate } = useGameDataStore.getState().pendingCatalog!
  expect(
    await loadCatalog(candidate.config, false, { prepared: candidate, confirmed: true }),
  ).toMatchObject({ kind: 'applied' })
  expect((await readGameDataCachePair()).settings?.dataSourceConfig).toMatchObject({
    acceptedRevision: changed,
    verifiedRevision: changed,
  })
  expect(await useGameDataStore.getState().rollbackCatalog()).toBe(true)
  github.fetch.mockClear()
  expect(await loadCatalog(useGameDataStore.getState().dataSourceConfig!, true)).toEqual({
    kind: 'staged',
  })
  expect(github.fetch.mock.calls.some(([url]) => url.includes(`/${changed}/data/feats.json`))).toBe(
    true,
  )
})

test.each([
  'warning',
  'legacy',
  'schema',
  'generation',
])('handles a %s cache without silently acknowledging a stale or incomplete check', async (condition) => {
  const github = stubGitHub()
  github.setWarning(condition === 'warning')
  const { loadCatalog } = useGameDataStore.getState()
  await loadCatalog(source)
  github.setWarning(false)
  const state = useGameDataStore.getState()
  if (condition === 'legacy' && state.dataSourceConfig?.type === 'remote')
    useGameDataStore.setState({
      dataSourceConfig: { ...state.dataSourceConfig, verifiedRevision: undefined },
    })
  if (condition === 'schema')
    useGameDataStore.setState({
      cacheExpectation: { ...state.cacheExpectation!, cacheSchemaVersion: 0 },
    })
  if (condition === 'generation')
    await writeGameDataCache(state.gameData!, state.dataSourceConfig!, {
      config: state.dataSourceConfig!,
    })
  github.fetch.mockClear()
  const result = await loadCatalog(useGameDataStore.getState().dataSourceConfig!, true)
  if (condition === 'generation') {
    expect(result).toMatchObject({
      kind: 'rejected',
      message: expect.stringContaining('cache changed'),
    })
    expect(github.fetch).toHaveBeenCalledTimes(2)
  } else {
    expect(result).toMatchObject({ kind: 'applied' })
    expect(github.fetch.mock.calls.some(([url]) => url.includes('raw.githubusercontent.com'))).toBe(
      true,
    )
  }
})
