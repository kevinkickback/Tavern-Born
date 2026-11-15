import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import {
  createGameDataAvailabilityIndex,
  getUnavailableCharacterContent,
} from '@/lib/character/additionalContentAvailability'
import { clearGameDataCache, readGameDataCachePair } from '@/lib/storage/dataCache'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const remote = {
  type: 'remote' as const,
  path: 'https://catalog.example.test/rules',
  isValid: true,
}
const local = { type: 'local' as const, path: 'C:/Rules/5etools', isValid: true }
const initial = useGameDataStore.getState()
const initialCharacters = useCharacterStore.getState()

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  useGameDataStore.setState(initial)
  useCharacterStore.setState(initialCharacters)
  await clearGameDataCache(true)
})

test.each([
  remote,
  local,
])('keeps transport failures separate from verified $type removals', async (source) => {
  let unavailable: 'temporary' | 'missing' | undefined
  let holdRead: Promise<void> | undefined
  const resource = 'fluff-backgrounds.json'
  const backgrounds = [
    { name: 'Sage', source: 'PHB' },
    { name: 'Sage', source: 'XPHB' },
  ]
  const items = [
    { name: 'Sentinel Shield', source: 'DMG' },
    { name: 'Sentinel Shield', source: 'XDMG' },
  ]
  const files: Record<string, unknown> = {
    'backgrounds.json': { background: backgrounds },
    'items.json': { item: items },
    'feats.json': {
      feat: [
        { name: 'Test Feat', source: 'PHB' },
        { name: 'Retired Feat', source: 'PHB' },
      ],
    },
    [resource]: { backgroundFluff: [] },
  }
  const readRemote = async (input: string) => {
    const path = input.slice(remote.path.length + '/data/'.length)
    if (path === 'feats.json') await holdRead
    if (path === resource && unavailable)
      return Promise.resolve(new Response(null, { status: unavailable === 'missing' ? 404 : 503 }))
    return Promise.resolve(
      path in files ? Response.json(files[path]) : new Response(null, { status: 404 }),
    )
  }
  vi.stubGlobal('fetch', readRemote)
  vi.stubGlobal('electronAPI', {
    readLocalJson: async (path: string) => {
      const file = path.slice(local.path.length + 1)
      if (file === 'feats.json') await holdRead
      if (file === resource && unavailable === 'temporary')
        return Promise.reject(new Error('EBUSY: file is in use'))
      if (!(file in files) || (file === resource && unavailable === 'missing'))
        return Promise.reject(new Error('ENOENT: file is missing'))
      return Promise.resolve(files[file])
    },
  })

  const { loadCatalog } = useGameDataStore.getState()
  expect(await loadCatalog(source)).toMatchObject({ kind: 'applied' })
  const accepted = useGameDataStore.getState()
  const acceptedPair = await readGameDataCachePair()
  expect(accepted.dataSourceConfig?.type).toBe(source.type)
  expect(acceptedPair.cache?.sourceSnapshot.resources).toContain(resource)

  unavailable = 'temporary'
  expect(await loadCatalog(accepted.dataSourceConfig!, true)).toMatchObject({
    kind: 'rejected',
    message: expect.stringContaining(resource),
  })
  expect(useGameDataStore.getState().pendingCatalog).toBeNull()
  expect(useGameDataStore.getState().gameData).toBe(accepted.gameData)
  expect((await readGameDataCachePair()).cache).toEqual(acceptedPair.cache)

  // A replacement source does not carry the old inventory during preparation.
  const replacement = { ...source, path: `${source.path}/backup` }
  if (source.type === 'remote') {
    vi.stubGlobal('fetch', (input: string) => {
      const path = input.slice(replacement.path.length + '/data/'.length)
      return Promise.resolve(
        path === resource
          ? Response.json({})
          : path in files
            ? Response.json(files[path])
            : new Response(null, { status: 404 }),
      )
    })
    expect(await loadCatalog(replacement)).toMatchObject({
      kind: 'rejected',
      message: expect.stringContaining(resource),
    })
    expect(useGameDataStore.getState().pendingCatalog).toBeNull()
    expect((await readGameDataCachePair()).cache).toEqual(acceptedPair.cache)
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', readRemote)
  }

  unavailable = 'missing'
  files['feats.json'] = {
    feat: [
      { name: 'Test Feat', source: 'PHB' },
      { name: 'New Feat', source: 'PHB' },
    ],
  }
  files['backgrounds.json'] = { background: backgrounds.slice(1) }
  files['items.json'] = { item: items.slice(1) }
  expect(await loadCatalog(accepted.dataSourceConfig!)).toEqual({ kind: 'staged' })
  const staged = useGameDataStore.getState().pendingCatalog!
  expect(staged.removals).toHaveLength(4)
  expect(staged.removals).toEqual(
    expect.arrayContaining([
      resource,
      expect.stringMatching(/retired feat.*phb/i),
      expect.stringMatching(/sage.*\bphb\b/i),
      expect.stringMatching(/sentinel shield.*\bdmg\b/i),
    ]),
  )
  const releaseWorkflow = useGameDataStore.getState().protectCatalog()
  try {
    expect(
      await loadCatalog(staged.candidate.config, false, {
        prepared: staged.candidate,
        confirmed: true,
      }),
    ).toMatchObject({ kind: 'rejected' })
    expect(useGameDataStore.getState().pendingCatalog).toBe(staged)
  } finally {
    releaseWorkflow()
  }
  expect((await readGameDataCachePair()).cache).toEqual(acceptedPair.cache)

  const saved = makeCharacterFixture({
    name: 'Affected Hero',
    background: 'Sage',
    backgroundSource: 'PHB',
    feats: [{ id: 'retired', name: 'Retired Feat', source: 'PHB', description: '' }],
    equipment: [
      {
        id: 'shield',
        name: 'Sentinel Shield',
        source: 'DMG',
        type: 'S',
        quantity: 1,
        equipped: true,
      },
    ],
  })
  useCharacterStore.setState({ characters: [saved] })
  const withdrawnReferences = () => [
    ...getUnavailableCharacterContent(
      saved,
      createGameDataAvailabilityIndex(useGameDataStore.getState().gameData!),
    ),
  ]
  const user = userEvent.setup()
  render(<DataSourceConfigurator />)
  await user.click(screen.getByText('Added content'))
  expect(screen.getByText(/new feat.*phb/i)).toBeTruthy()
  await user.click(screen.getByText('Removed content'))
  expect(screen.getByText(resource)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Check saved characters' }))
  expect(await screen.findByText(/content unavailable in this preview: Affected Hero/)).toBeTruthy()
  expect((await readGameDataCachePair()).cache).toEqual(acceptedPair.cache)
  await user.click(screen.getByRole('button', { name: 'Apply game data update' }))
  await waitFor(async () =>
    expect((await readGameDataCachePair()).cache?.sourceSnapshot.resources).not.toContain(resource),
  )
  const { loadFromCache } = useGameDataStore.getState()
  await loadFromCache()
  expect(withdrawnReferences()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Sage', source: 'PHB' }),
      expect.objectContaining({ name: 'Sentinel Shield', source: 'DMG' }),
    ]),
  )
  expect(useCharacterStore.getState().characters).toEqual([saved])
  const rollback = screen.getByRole('button', { name: 'Restore previous game data' })
  await user.click(rollback)
  const confirm = screen.getByRole('button', { name: /^Restore$/ })
  let releaseRead = () => {}
  holdRead = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  let checking: ReturnType<typeof loadCatalog> | undefined
  try {
    await act(() => {
      checking = loadCatalog(accepted.dataSourceConfig!, true)
    })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect((rollback as HTMLButtonElement).disabled).toBe(true)
    expect(await useGameDataStore.getState().rollbackCatalog()).toBe(false)
    expect((await readGameDataCachePair()).previous).toBeDefined()
  } finally {
    await act(async () => {
      releaseRead()
      await checking
    })
  }
  await user.click(confirm)
  await waitFor(async () =>
    expect((await readGameDataCachePair()).cache?.sourceSnapshot.resources).toContain(resource),
  )
  expect((await readGameDataCachePair()).previous).toBeUndefined()
  expect(useGameDataStore.getState().lastContentFingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(
    withdrawnReferences().some(({ name }) => name === 'Sage' || name === 'Sentinel Shield'),
  ).toBe(false)
  expect(useCharacterStore.getState().characters).toEqual([saved])
})
