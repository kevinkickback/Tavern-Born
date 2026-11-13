import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
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
  const resource = 'fluff-backgrounds.json'
  const files: Record<string, unknown> = {
    'feats.json': {
      feat: [
        { name: 'Test Feat', source: 'PHB' },
        { name: 'Retired Feat', source: 'PHB' },
      ],
    },
    [resource]: { backgroundFluff: [] },
  }
  const readRemote = (input: string) => {
    const path = input.slice(remote.path.length + '/data/'.length)
    if (path === resource && unavailable)
      return Promise.resolve(new Response(null, { status: unavailable === 'missing' ? 404 : 503 }))
    return Promise.resolve(
      path in files ? Response.json(files[path]) : new Response(null, { status: 404 }),
    )
  }
  vi.stubGlobal('fetch', readRemote)
  vi.stubGlobal('electronAPI', {
    readLocalJson: (path: string) => {
      const file = path.slice(local.path.length + 1)
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
  expect(await loadCatalog(accepted.dataSourceConfig!)).toEqual({ kind: 'staged' })
  expect(useGameDataStore.getState().pendingCatalog?.removals).toEqual([
    resource,
    expect.stringMatching(/retired feat.*phb/i),
  ])
  expect((await readGameDataCachePair()).cache).toEqual(acceptedPair.cache)

  useCharacterStore.setState({
    characters: [
      makeCharacterFixture({
        name: 'Affected Hero',
        feats: [{ id: 'retired', name: 'Retired Feat', source: 'PHB', description: '' }],
      }),
    ],
  })
  const user = userEvent.setup()
  render(<DataSourceConfigurator />)
  await user.click(screen.getByText('See what this source now provides'))
  expect(screen.getByText(/new feat.*phb/i)).toBeTruthy()
  await user.click(screen.getByText('See what this source no longer provides'))
  expect(screen.getByText(resource)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Check saved characters' }))
  expect(await screen.findByText(/content unavailable in this preview: Affected Hero/)).toBeTruthy()
  expect((await readGameDataCachePair()).cache).toEqual(acceptedPair.cache)
  await user.click(screen.getByRole('button', { name: 'Apply game data update' }))
  await waitFor(async () =>
    expect((await readGameDataCachePair()).cache?.sourceSnapshot.resources).not.toContain(resource),
  )
})
