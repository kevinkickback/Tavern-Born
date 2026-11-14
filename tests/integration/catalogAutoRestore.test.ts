import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { set } from 'idb-keyval'
import { afterEach, expect, test, vi } from 'vitest'
import {
  clearGameDataCache,
  readGameDataCachePair,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { useGameDataStore } from '@/store/gameDataStore'

const source = { type: 'remote', path: 'https://example.test/rules', isValid: true } as const
const initial = useGameDataStore.getState()
const installed = { packId: 'srd', packVersion: '1' }
const originalDate = '2026-01-01T00:00:00.000Z'

afterEach(async () => {
  installed.packVersion = '1'
  vi.unstubAllGlobals()
  useGameDataStore.setState(initial)
  await clearGameDataCache(true)
})

async function setUpObsoleteCache() {
  vi.stubGlobal('electronAPI', {
    getBundledManifest: () => Promise.resolve(installed),
    readBundledJson: async (path: string) =>
      JSON.parse(await readFile(resolve('resources/srd/data', path), 'utf8')),
  })
  let feat = 'Original feat'
  let warning = false
  let holdRead: Promise<void> | undefined
  const fetch = vi.fn(async (url: string) => {
    const path = url.slice(source.path.length + 6)
    if (path === 'fluff-races.json' && warning) return new Response(null, { status: 503 })
    if (path !== 'feats.json') return new Response(null, { status: 404 })
    await holdRead
    return Response.json({ feat: [{ name: feat, source: 'PHB' }] })
  })
  vi.stubGlobal('fetch', fetch)
  expect(await useGameDataStore.getState().loadCatalog(source)).toMatchObject({ kind: 'applied' })
  const { cache: accepted } = await readGameDataCachePair()
  const obsolete = {
    ...accepted!,
    cacheSchemaVersion: 0,
    lastDataChangedAt: originalDate,
  }
  await set('tb:game-data-cache', obsolete)
  useGameDataStore.setState(initial)
  return {
    accepted: obsolete,
    fetch,
    changeContent: () => {
      feat = 'Updated feat'
    },
    failOptionalRead: () => {
      warning = true
    },
    hold: (pending: Promise<void>) => {
      holdRead = pending
    },
  }
}

const start = () => useGameDataStore.getState().loadFromCache({ checkForUpdates: true })

test('restores a verified matching obsolete catalog and preserves its last change date', async () => {
  const { accepted } = await setUpObsoleteCache()
  const { backgroundRefresh } = await start()
  expect(useGameDataStore.getState().sessionBundledSource).not.toBeNull()
  expect(useGameDataStore.getState().isStartupRecovering).toBe(true)
  await expect(backgroundRefresh).resolves.toBe(false)
  const state = useGameDataStore.getState()
  const { cache, previous, refreshCheck } = await readGameDataCachePair()
  expect(state.sessionBundledSource).toBeNull()
  expect(state.isStartupRecovering).toBe(false)
  expect(state.pendingCatalog).toBeNull()
  expect(state.gameData?.feats.map(({ name }) => name)).toContain('Original feat')
  expect(cache?.contentFingerprint).toBe(accepted.contentFingerprint)
  expect(cache?.lastDataChangedAt).toBe(originalDate)
  expect(cache?.generation).not.toBe(accepted.generation)
  expect(previous).toBeUndefined()
  expect(refreshCheck?.needsReview).toBeFalsy()
})

test.each([
  'changed',
  'warning',
  'missing inventory',
  'different layer',
  'missing cache',
] as const)('leaves %s recovery behind explicit Apply', async (condition) => {
  const { accepted, changeContent, failOptionalRead } = await setUpObsoleteCache()
  if (condition === 'changed') changeContent()
  if (condition === 'warning') failOptionalRead()
  if (condition === 'missing inventory')
    await set('tb:game-data-cache', { ...accepted, externalKeys: undefined })
  if (condition === 'different layer') installed.packVersion = '2'
  if (condition === 'missing cache') await clearGameDataCache()
  await (await start()).backgroundRefresh
  expect(useGameDataStore.getState().sessionBundledSource).not.toBeNull()
  expect(useGameDataStore.getState().isStartupRecovering).toBe(false)
  expect(useGameDataStore.getState().pendingCatalog).toMatchObject({
    reason: condition === 'changed' ? 'update' : 'recovery',
  })
  expect(useGameDataStore.getState().pendingCatalog?.restoreWhenIdle).toBeUndefined()
  expect((await readGameDataCachePair()).expectedCache?.generation).toBe(
    condition === 'missing cache' ? undefined : accepted.generation,
  )
})

test('waits for the workflow and draft to clear, then restores without checking again', async () => {
  const { fetch } = await setUpObsoleteCache()
  const { backgroundRefresh } = await start()
  const release = useGameDataStore.getState().protectCatalog()
  useGameDataStore.setState({ catalogDraftDirty: true })
  try {
    await backgroundRefresh
    expect(useGameDataStore.getState().pendingCatalog?.restoreWhenIdle).toBe(true)
    const reads = fetch.mock.calls.length
    release()
    await Promise.resolve()
    expect(useGameDataStore.getState().sessionBundledSource).not.toBeNull()
    expect(useGameDataStore.getState().isStartupRecovering).toBe(false)
    useGameDataStore.setState({ catalogDraftDirty: false })
    await vi.waitFor(() => expect(useGameDataStore.getState().sessionBundledSource).toBeNull())
    expect(fetch.mock.calls.length).toBe(reads)
  } finally {
    release()
    useGameDataStore.setState({ catalogDraftDirty: false })
  }
})

test('a new accepted cache generation supersedes a matching rebuild', async () => {
  const { accepted, hold } = await setUpObsoleteCache()
  let finish = () => {}
  hold(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  const { backgroundRefresh } = await start()
  try {
    const concurrent = await writeGameDataCache(accepted.data, source, { config: source })
    finish()
    await backgroundRefresh
    expect((await readGameDataCachePair()).cache?.generation).toBe(concurrent.generation)
    expect(useGameDataStore.getState().sessionBundledSource).not.toBeNull()
    expect(useGameDataStore.getState().error).toContain('saved game data changed')
  } finally {
    finish()
  }
})
