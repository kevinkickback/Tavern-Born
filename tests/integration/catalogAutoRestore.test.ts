import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { del, set } from 'idb-keyval'
import { afterEach, expect, test, vi } from 'vitest'
import {
  clearGameDataCache,
  computeGameDataFingerprint,
  GAME_DATA_SETTINGS_KEY,
  readGameDataCachePair,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { useGameDataStore } from '@/store/gameDataStore'
import type { DataSourceConfig } from '@/types/5etools'
import { readLocalCatalogResource } from '../../electron/localCatalogResource'
import { itemTextTypes } from '../fixtures/itemEntryFixtures'

const source = { type: 'remote', path: 'https://example.test/rules', isValid: true } as const
const github = { ...source, path: 'https://github.com/example/rules' }
const revision = 'a'.repeat(40)
const initial = useGameDataStore.getState()
const installed = { packId: 'srd', packVersion: '1' }
const originalDate = '2026-01-01T00:00:00.000Z'

afterEach(async () => {
  installed.packVersion = '1'
  vi.unstubAllGlobals()
  useGameDataStore.setState(initial)
  await clearGameDataCache(true)
  await del('character-storage')
})

async function setUpObsoleteCache(
  origin: Exclude<DataSourceConfig, { type: 'bundled' }> = source,
  options?: {
    itemFilter?: boolean
    encodedLink?: boolean
    fullBundled?: boolean
    beforeLocalActivation?: () => Promise<void>
  },
) {
  vi.stubGlobal('electronAPI', {
    getBundledManifest: () => Promise.resolve(installed),
    readBundledJson: async (path: string) => {
      if (
        origin === source ||
        options?.fullBundled ||
        path === 'skills.json' ||
        path === 'items-base.json'
      )
        return JSON.parse(await readFile(resolve('resources/srd/data', path), 'utf8'))
      if (path === 'feats.json') return { feat: [{ name: 'Built-in feat', source: 'PHB' }] }
      if (path === 'items.json')
        return {
          item: [
            {
              name: 'Fixture Hat',
              source: 'DMG',
              entries: ['The GM chooses a {@filter rare item|items|rarity=rare}.'],
            },
          ],
        }
      return {}
    },
    readLocalJson: async (path: string, root: string, probe?: boolean) => {
      const result = await readLocalCatalogResource(path, root, probe)
      return result.text === undefined
        ? { observed: true, stamp: result.stamp }
        : { observed: true, stamp: result.stamp, data: JSON.parse(result.text) }
    },
    approveLocalDataRoot: () => options?.beforeLocalActivation?.(),
  })
  let feat = 'Original feat'
  let warning = false
  let head = revision
  let holdRead: Promise<void> | undefined
  const fetch = vi.fn(async (url: string) => {
    if (url.startsWith('https://api.github.com/'))
      return Response.json(url.includes('/commits/') ? { sha: head } : { default_branch: 'main' })
    const path = url.split('/data/').pop()
    if (origin !== source && path === 'items-base.json')
      return Response.json({
        itemType: itemTextTypes.map((type) =>
          type.abbreviation === 'LA' ? { ...type, name: 'Light Armor' } : type,
        ),
        itemEntry: [
          {
            name: 'Armor of Resistance',
            source: 'DMG',
            entriesTemplate: ['You resist fire damage.'],
          },
        ],
        baseitem: [
          {
            name: 'Leather Armor',
            source: 'PHB',
            edition: 'classic',
            type: 'LA',
            armor: true,
            rarity: 'none',
            weight: 10,
            srd: true,
            ac: 11,
          },
        ],
      })
    if (origin !== source && path === 'magicvariants.json')
      return Response.json({
        magicvariant: [
          {
            name: 'Armor of Fire Resistance',
            type: 'GV|DMG',
            edition: 'classic',
            requires: [{ armor: true }],
            inherits: {
              source: 'DMG',
              srd: true,
              nameSuffix: ' of Fire Resistance',
              rarity: 'rare',
              reqAttune: true,
              resist: ['fire'],
              entries: ['{#itemEntry Armor of Resistance}'],
            },
          },
        ],
      })
    if (path === 'fluff-races.json' && warning) return new Response(null, { status: 503 })
    if (path === 'backgrounds.json' && options?.itemFilter)
      return Response.json({
        background: [
          {
            name: 'Armor Collector',
            source: 'PHB',
            entries: [
              {
                type: 'entries',
                name: 'Equipment:',
                entries: ['Choose {@filter light armor|items|type=LA}.'],
              },
            ],
          },
        ],
      })
    if (path !== 'feats.json') return new Response(null, { status: 404 })
    await holdRead
    return Response.json({
      feat: [
        {
          name: feat,
          source: 'PHB',
          ...(options?.encodedLink && {
            entries: ['See {@item Leather&#32;Armor of Fire Resistance|DMG}.'],
          }),
        },
      ],
    })
  })
  vi.stubGlobal('fetch', fetch)
  if (origin.type === 'local') {
    for (const name of ['items-base.json', 'magicvariants.json', 'feats.json']) {
      const response = await fetch(`fixture/data/${name}`)
      await writeFile(join(origin.path, basename(name)), await response.text())
    }
  }
  expect(await useGameDataStore.getState().loadCatalog(origin)).toMatchObject({ kind: 'applied' })
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
    changeRevision: () => {
      head = 'b'.repeat(40)
    },
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

test.each([
  'match',
  'changed revision',
  'old record edit',
  'old reference',
  'encoded old link',
  'old item filter',
  'manual check',
  'matching local files',
  'changed local bytes',
  'local library race',
] as const)('handles an additive startup rebuild with %s', async (condition) => {
  const isLocal = condition.includes('local')
  const folder = isLocal ? await mkdtemp(join(tmpdir(), 'tavern-restore-')) : undefined
  const origin = folder ? { type: 'local' as const, path: folder, isValid: true } : github
  let race: (() => Promise<void>) | undefined
  try {
    const { accepted, changeRevision } = await setUpObsoleteCache(origin, {
      itemFilter: condition === 'old item filter',
      encodedLink: condition === 'encoded old link',
      fullBundled: condition === 'match',
      beforeLocalActivation: async () => race?.(),
    })
    const { settings } = await readGameDataCachePair()
    const added = accepted.data.items.find(
      (item) => item.magicVariantGenerated && item.name === 'Leather Armor of Fire Resistance',
    )!
    expect(added).toBeDefined()
    const oldData = {
      ...accepted.data,
      items: accepted.data.items.filter((item) => item.name !== added.name),
      feats:
        condition === 'old record edit'
          ? accepted.data.feats.map((feat) => ({
              ...feat,
              name: feat.name === 'Original feat' ? 'Previous feat' : feat.name,
            }))
          : accepted.data.feats,
    }
    const fingerprint = computeGameDataFingerprint(oldData)
    const externalKeys = accepted.externalKeys?.filter(
      (key) => !key.includes(added.name.toLowerCase()),
    )
    await set('tb:game-data-cache', {
      ...accepted,
      data: oldData,
      contentFingerprint: fingerprint,
      externalKeys,
    })
    await set(GAME_DATA_SETTINGS_KEY, {
      state: { ...settings, lastContentFingerprint: fingerprint },
    })
    if (condition === 'changed revision') changeRevision()
    const addSavedReference = () =>
      set('character-storage', {
        state: { characters: [{ equipment: [{ name: added.name, source: added.source }] }] },
      })
    if (condition === 'old reference') await addSavedReference()
    if (condition === 'changed local bytes' && folder) {
      const path = join(folder, 'feats.json')
      await writeFile(path, `${await readFile(path, 'utf8')}\n`)
    }
    const changeLibrary = vi.fn(addSavedReference)
    if (condition === 'local library race') race = changeLibrary
    if (condition === 'manual check') {
      await useGameDataStore.getState().loadFromCache({ checkForUpdates: false })
      await useGameDataStore.getState().loadCatalog(origin, true)
    } else {
      await (await start()).backgroundRefresh
    }
    const state = useGameDataStore.getState()
    if (condition === 'local library race') expect(changeLibrary).toHaveBeenCalledOnce()
    if (condition === 'match' || condition === 'matching local files') {
      expect(state.pendingCatalog?.reason ?? null).toBeNull()
      expect(state.sessionBundledSource).toBeNull()
      expect((await readGameDataCachePair()).cache?.contentFingerprint).toBe(
        accepted.contentFingerprint,
      )
      expect(state.lastDataChangedAt).not.toBe(originalDate)
    } else {
      expect(state.pendingCatalog).not.toBeNull()
      expect(state.sessionBundledSource).not.toBeNull()
      expect((await readGameDataCachePair()).expectedCache?.contentFingerprint).toBe(fingerprint)
    }
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true })
  }
})

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
