import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { del, get, set } from 'idb-keyval'
import { afterEach, expect, test, vi } from 'vitest'
import type { CatalogRequestMessage, CatalogWorkerMessage } from '@/lib/5etools/catalogProtocol'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import * as calculations from '@/lib/calculations/characterCalculationContext'
import { savedCharactersSurviveRebuild } from '@/lib/character/catalogRebuildCompatibility'
import {
  buildClassChoiceFeatureCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  clearGameDataCache,
  computeGameDataFingerprint,
  GAME_DATA_SETTINGS_KEY,
  readGameDataCachePair,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { useGameDataStore } from '@/store/gameDataStore'
import type { DataSourceConfig, Spell5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { readLocalCatalogResource } from '../../electron/localCatalogResource'
import { itemTextTypes } from '../fixtures/itemEntryFixtures'
import { makePsionicFixture } from '../fixtures/psionicFixtures'

const refreshMetadataWrite = vi.hoisted(() => vi.fn(async () => {}))

vi.mock(import('@/lib/storage/dataCache'), async (importOriginal) => {
  const actual = await importOriginal()
  const writeCatalogRefreshCheck: typeof actual.writeCatalogRefreshCheck = async (...args) => {
    await refreshMetadataWrite()
    return actual.writeCatalogRefreshCheck(...args)
  }
  return { ...actual, writeCatalogRefreshCheck }
})

const source = { type: 'remote', path: 'https://example.test/rules', isValid: true } as const
const github = { ...source, path: 'https://github.com/example/rules' }
const revision = 'a'.repeat(40)
const initial = useGameDataStore.getState()
const installed = { packId: 'srd', packVersion: '1' }
const originalDate = '2026-01-01T00:00:00.000Z'

afterEach(async () => {
  refreshMetadataWrite.mockReset()
  installed.packVersion = '1'
  vi.unstubAllGlobals()
  useGameDataStore.setState(initial)
  await clearGameDataCache(true)
  await del('character-storage')
})

async function setUpObsoleteCache(origin: Exclude<DataSourceConfig, { type: 'bundled' }> = source) {
  vi.stubGlobal('electronAPI', {
    getBundledManifest: () => Promise.resolve(installed),
    readBundledJson: async (path: string) => {
      if (path === 'skills.json' || path === 'items-base.json')
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
    approveLocalDataRoot: () => beforeLocalActivation?.(),
  })
  let beforeLocalActivation: (() => Promise<void>) | undefined
  let feat = 'Original feat'
  let warning = false
  let upstreamMetadata = {}
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
    if (path !== 'feats.json') return new Response(null, { status: 404 })
    await holdRead
    return Response.json({
      ...upstreamMetadata,
      feat: [
        {
          name: feat,
          source: 'PHB',
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
    beforeActivation: (callback: () => Promise<void>) => {
      beforeLocalActivation = callback
    },
    fetch,
    changeRevision: () => {
      head = 'b'.repeat(40)
    },
    changeUpstreamMetadata: () => {
      upstreamMetadata = { parserIgnoresThis: true }
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
const item = {
  id: 'inventory-hat',
  name: 'Fixture Hat',
  source: 'DMG',
  type: 'G',
  quantity: 1,
  equipped: true,
}

test('quiet rebuild rejects replacement of an explicitly undefined projection field', () => {
  const character = createEmptyCharacter({ name: 'Saved character' })
  const data = createEmptyGameData()
  const { createCharacterCalculationContext: calculate } = calculations
  const project =
    (key: 'portrait' | 'portraitTransform') =>
    (...args: Parameters<typeof calculate>) => {
      const context = calculate(...args)
      const { portrait: _portrait, portraitTransform: _transform, ...common } = context.character
      return { ...context, character: { ...common, [key]: undefined } }
    }
  const calculation = vi.spyOn(calculations, 'createCharacterCalculationContext')
  try {
    calculation
      .mockImplementationOnce(project('portrait'))
      .mockImplementationOnce(project('portrait'))
      .mockImplementationOnce(project('portrait'))
      .mockImplementationOnce(project('portraitTransform'))
    expect(savedCharactersSurviveRebuild(data, data, [character])).toBe(true)
    expect(savedCharactersSurviveRebuild(data, data, [character])).toBe(false)
  } finally {
    calculation.mockRestore()
  }
})

test('same printing does not establish that a saved class or spell still works', () => {
  const character = createEmptyCharacter({
    name: 'Saved character',
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
  })
  character.spells.spellProfiles[0].cantrips = ['Fire Bolt|PHB']
  const fighter = { name: 'Fighter', source: 'PHB', hd: { faces: 10 } }
  const bolt: Spell5e = {
    name: 'Fire Bolt',
    source: 'PHB',
    level: 0,
    school: 'V',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 120 } },
    duration: [{ type: 'instant' }],
    entries: ['1d10 fire damage'],
  }
  const old = { ...createEmptyGameData(), classes: [fighter], spells: [bolt] }
  expect(savedCharactersSurviveRebuild(old, old, [character])).toBe(true)
  expect(
    savedCharactersSurviveRebuild(
      old,
      { ...old, spells: [{ ...bolt, entries: ['2d10 cold damage'] }] },
      [character],
    ),
  ).toBe(false)
  expect(
    savedCharactersSurviveRebuild(old, { ...old, classes: [{ ...fighter, hd: { faces: 6 } }] }, [
      character,
    ]),
  ).toBe(false)
})

test('compares linked subclass rules independently of parser provenance', () => {
  const character = createEmptyCharacter({
    name: 'Saved character',
    originSystem: '2014',
    allowedSources: ['PHB', 'XGE'],
    classProgression: [
      {
        name: 'Sorcerer',
        source: 'PHB',
        levels: 1,
        subclass: 'Divine Soul',
        subclassSource: 'XGE',
      },
    ],
  })
  const feature = {
    name: 'Favored by the Gods',
    source: 'XGE',
    entries: ['Add 2d4 to the roll.'],
  }
  const reference = {
    ref: 'Favored by the Gods|Sorcerer|PHB|Divine Soul|XGE|1',
    name: feature.name,
    source: feature.source,
    className: 'Sorcerer',
    classSource: 'PHB',
    subclassShortName: 'Divine Soul',
    subclassSource: 'XGE',
    level: 1,
    feature,
  }
  const subclass = {
    name: 'Divine Soul',
    shortName: 'Divine Soul',
    source: 'XGE',
    className: 'Sorcerer',
    classSource: 'PHB',
    subclassFeatureRefs: [reference],
  }
  const sorcerer = { name: 'Sorcerer', source: 'PHB', subclasses: [subclass] }
  const old = { ...createEmptyGameData(), classes: [sorcerer] }
  const rebuilt = { ...subclass, scopedSubclassFeatureDependencies: true as const }
  const withSubclass = (parsed: typeof rebuilt) => ({
    ...old,
    classes: [{ ...sorcerer, subclasses: [parsed] }],
  })
  expect(savedCharactersSurviveRebuild(old, withSubclass(rebuilt), [character])).toBe(true)
  expect(
    savedCharactersSurviveRebuild(
      old,
      withSubclass({
        ...rebuilt,
        subclassFeatureRefs: [{ ...reference, feature: { ...feature, entries: ['Add 2d6.'] } }],
      }),
      [character],
    ),
  ).toBe(false)
})

test.skipIf(!existsSync('data/psionics.json') || !existsSync('data/class/class-mystic.json'))(
  'checks a saved psionic printing even when the source is filtered',
  () => {
    const { data, character: fixture } = makePsionicFixture()
    const character = createEmptyCharacter({
      name: fixture.name,
      allowedSources: fixture.allowedSources,
      classProgression: fixture.classProgression,
      initialClass: fixture.initialClass,
    })
    const catalogs = buildClassChoiceFeatureCatalogs(data)
    const cls = data.classes.find(({ name }) => name === 'Mystic')!
    const subclass = cls.subclasses?.find(({ name }) => name === 'Order of the Avatar')
    const choice = getCharacterClassChoices(
      cls,
      subclass,
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    ).find(({ label }) => label === 'Psionic Talents')!
    const talent = (data.psionics ?? []).find(({ name }) => name === 'Mind Thrust')!
    const withTalent = applyCharacterCommandResult(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [{ entityType: 'psionic', name: talent.name, source: talent.source }],
        { classes: data.classes, catalogs },
      ),
    )
    const saved = characterPersistenceSchema.parse({ ...withTalent, allowedSources: [] })
    const changed = {
      ...data,
      psionics: data.psionics?.map((row) =>
        row === talent ? { ...row, entries: ['Changed talent damage'] } : row,
      ),
    }
    expect(savedCharactersSurviveRebuild(data, data, [saved])).toBe(true)
    expect(savedCharactersSurviveRebuild(data, changed, [saved])).toBe(false)
  },
)

test.each([
  { condition: 'same GitHub commit', kind: 'github', restores: true },
  { condition: 'same HTTPS inputs without a validator', kind: 'https', restores: true },
  { condition: 'same folder inputs', kind: 'local', restores: true },
  { condition: 'different GitHub commit', kind: 'github', restores: false },
  { condition: 'changed HTTPS input', kind: 'https', restores: false },
  { condition: 'changed local bytes', kind: 'local', restores: false },
  { condition: 'missing prior HTTPS hashes', kind: 'https', withoutHashes: true, restores: true },
  { condition: 'missing prior folder hashes', kind: 'local', withoutHashes: true, restores: true },
  { condition: 'missing GitHub revision', kind: 'github', withoutHashes: true, restores: false },
  {
    condition: 'missing choice without prior hashes',
    kind: 'https',
    withoutHashes: true,
    restores: false,
  },
  {
    condition: 'changed saved item without prior hashes',
    kind: 'https',
    withoutHashes: true,
    restores: false,
  },
  { condition: 'missing saved choice', kind: 'github', restores: false },
  { condition: 'changed saved item benefit', kind: 'github', restores: false },
  { condition: 'unsupported saved character', kind: 'github', restores: false },
  { condition: 'manual check', kind: 'github', restores: false },
  { condition: 'library race', kind: 'local', restores: false },
  { condition: 'hashless library race', kind: 'local', withoutHashes: true, restores: false },
])('handles startup reparse with $condition', async ({
  condition,
  kind,
  restores,
  withoutHashes,
}) => {
  const folder = kind === 'local' ? await mkdtemp(join(tmpdir(), 'tavern-restore-')) : undefined
  const origin = folder
    ? { type: 'local' as const, path: folder, isValid: true }
    : kind === 'https'
      ? source
      : github
  const changedLibrary = vi.fn(() => set('character-storage', { state: { characters: [] } }))
  try {
    const { accepted, changeRevision, changeUpstreamMetadata, beforeActivation } =
      await setUpObsoleteCache(origin)
    if (condition.endsWith('library race')) beforeActivation(changedLibrary)
    const { settings } = await readGameDataCachePair()
    // Same source can yield different parsed rows after a parser upgrade.
    const oldData = {
      ...accepted.data,
      lookups: undefined,
      feats: accepted.data.feats.map((row) =>
        row.name === 'Original feat' ? { ...row, entries: ['Old parser output'] } : row,
      ),
      items: accepted.data.items
        .filter((row) => !row.magicVariantGenerated)
        .map((row) =>
          condition.startsWith('changed saved item') && row.name === item.name
            ? { ...row, bonusAc: '+1' }
            : row,
        ),
    }
    const fingerprint = computeGameDataFingerprint(oldData)
    await set('tb:game-data-cache', {
      ...accepted,
      data: oldData,
      contentFingerprint: fingerprint,
      externalKeys: accepted.externalKeys?.filter(
        (key) => !key.includes('leather armor of fire resistance'),
      ),
    })
    await set(GAME_DATA_SETTINGS_KEY, {
      state: {
        ...settings,
        lastContentFingerprint: fingerprint,
        ...(withoutHashes && {
          dataSourceConfig: {
            ...settings?.dataSourceConfig,
            acceptedRevision: undefined,
            resourceProof: undefined,
          },
        }),
      },
    })
    const character = createEmptyCharacter({
      name: 'Saved character',
      equipment: [
        condition === 'missing saved choice' || condition === 'missing choice without prior hashes'
          ? { ...item, name: 'Missing item' }
          : item,
      ],
      ...(condition === 'unsupported saved character' && { schemaVersion: 0 }),
    })
    const savedLibrary = { state: { characters: [character] } }
    await set('character-storage', savedLibrary)
    if (condition === 'different GitHub commit') changeRevision()
    if (condition === 'changed HTTPS input') changeUpstreamMetadata()
    if (condition === 'changed local bytes' && folder) {
      const path = join(folder, 'feats.json')
      await writeFile(path, `${await readFile(path, 'utf8')}\n`)
    }
    if (condition === 'manual check') {
      await useGameDataStore.getState().loadFromCache({ checkForUpdates: false })
      await useGameDataStore.getState().loadCatalog(origin, true)
    } else {
      await (await start()).backgroundRefresh
    }
    const state = useGameDataStore.getState()
    const { cache, expectedCache } = await readGameDataCachePair()
    if (condition.endsWith('library race')) expect(changedLibrary).toHaveBeenCalledOnce()
    if (restores) {
      expect(state.pendingCatalog === null).toBe(true)
      expect(state.sessionBundledSource).toBeNull()
      expect(state.cacheStatus).toBe('fetched')
      expect(cache?.contentFingerprint).toBe(accepted.contentFingerprint)
      expect(cache?.generation).not.toBe(accepted.generation)
      expect(await get('character-storage')).toEqual(savedLibrary)
      if (withoutHashes) {
        useGameDataStore.setState(initial)
        await useGameDataStore.getState().loadFromCache({ checkForUpdates: false })
        expect(useGameDataStore.getState().cacheStatus).toBe('cached')
        expect(useGameDataStore.getState().sessionBundledSource).toBeNull()
      }
    } else {
      expect(state.pendingCatalog).not.toBeNull()
      expect(state.sessionBundledSource).not.toBeNull()
      expect(expectedCache?.generation).toBe(accepted.generation)
    }
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true })
  }
})

test('restores a verified matching obsolete catalog and preserves its last change date', async () => {
  const { accepted } = await setUpObsoleteCache()
  await set('tb:game-data-previous-cache', accepted)
  const { backgroundRefresh } = await start()
  expect(useGameDataStore.getState().sessionBundledSource).not.toBeNull()
  expect(useGameDataStore.getState().isStartupRecovering).toBe(true)
  await expect(backgroundRefresh).resolves.toBe(false)
  const state = useGameDataStore.getState()
  const { cache, refreshCheck } = await readGameDataCachePair()
  expect(state.sessionBundledSource).toBeNull()
  expect(state.isStartupRecovering).toBe(false)
  expect(state.pendingCatalog).toBeNull()
  expect(state.gameData?.feats.map(({ name }) => name)).toContain('Original feat')
  expect(cache?.contentFingerprint).toBe(accepted.contentFingerprint)
  expect(cache?.lastDataChangedAt).toBe(originalDate)
  expect(cache?.generation).not.toBe(accepted.generation)
  expect(await get('tb:game-data-previous-cache')).toBeUndefined()
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

test('a confirmed Apply retains the worker candidate while its data is being loaded', async () => {
  const { accepted, changeContent } = await setUpObsoleteCache()
  changeContent()
  await (await start()).backgroundRefresh
  const state = useGameDataStore.getState()
  const pending = state.pendingCatalog!
  const data = pending.candidate
  expect(pending).toBeTruthy()
  let receive: ((message: CatalogWorkerMessage) => void) | undefined
  const sendCatalogMessage = vi.fn((message: CatalogRequestMessage) => {
    if (message.kind !== 'run') return
    if (message.command.kind === 'prepare') {
      receive?.({
        kind: 'result',
        id: message.id,
        result: { ...data, contentFingerprint: 'updated' },
      })
    } else if (message.command.kind === 'compare') {
      receive?.({
        kind: 'result',
        id: message.id,
        result: { additions: [], removals: [], incompleteRemovalPreview: false },
      })
    }
  })
  vi.stubGlobal('electronAPI', {
    ...window.electronAPI,
    onCatalogMessage: (listener: typeof receive) => {
      receive = listener
      return () => {
        receive = undefined
      }
    },
    sendCatalogMessage,
  })
  let finishCheck = () => {}
  refreshMetadataWrite.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishCheck = resolve
    }),
  )
  const backgroundRefresh = state.loadCatalog(source, true)
  await vi.waitFor(() =>
    expect(useGameDataStore.getState().pendingCatalog?.candidate).toHaveProperty('workerId'),
  )
  const candidate = useGameDataStore.getState().pendingCatalog!.candidate
  if (!('workerId' in candidate)) throw new Error('Expected a worker candidate')
  sendCatalogMessage.mockClear()
  const request = { prepared: candidate, confirmed: true }
  const applying = state.loadCatalog(candidate.config, false, request)
  await vi.waitFor(() =>
    expect(sendCatalogMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'run',
        command: { kind: 'take', workerId: candidate.workerId },
      }),
    ),
  )
  const [[take]] = sendCatalogMessage.mock.calls
  expect(useGameDataStore.getState().isCatalogActivating).toBe(true)
  await expect(state.restoreBundledData()).resolves.toBeUndefined()
  expect(await state.loadCatalog(source, true)).toMatchObject({ kind: 'rejected' })
  expect(await state.loadCatalog(source, false, { prepared: candidate })).toMatchObject({
    kind: 'rejected',
  })
  finishCheck()
  await backgroundRefresh
  expect(sendCatalogMessage.mock.calls).toHaveLength(1)
  expect((await readGameDataCachePair()).expectedCache?.generation).toBe(accepted.generation)
  receive?.({ kind: 'result', id: take.id, result: data })
  await expect(applying).resolves.toEqual({ kind: 'applied', changed: true })
  expect((await readGameDataCachePair()).cache?.data.feats.map(({ name }) => name)).toContain(
    'Updated feat',
  )
  expect(useGameDataStore.getState().isCatalogActivating).toBe(false)
})
