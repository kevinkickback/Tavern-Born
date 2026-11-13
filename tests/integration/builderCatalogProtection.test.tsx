import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { RequireActiveCharacter } from '@/components/layout/RequireActiveCharacter'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const gameData = useGameDataStore.getState()
const characters = useCharacterStore.getState()
const source = { type: 'remote', path: 'https://example.test/rules', isValid: true } as const

afterEach(() => {
  cleanup()
  useCharacterStore.setState(characters)
  useGameDataStore.setState(gameData)
})

test('defers Builder during activation and protects a draft after leaving the route', async () => {
  const character = makeCharacterFixture()
  useCharacterStore.setState({
    characters: [character],
    activeCharacter: character,
    activeCharacterId: character.id,
  })
  useGameDataStore.setState({ isCatalogActivating: true })
  const builder = render(
    <MemoryRouter initialEntries={['/build']}>
      <Routes>
        <Route element={<RequireActiveCharacter />}>
          <Route path="/build" element={<h1>Builder</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByRole('status').textContent).toBe('Applying game data…')
  expect(screen.queryByRole('heading', { name: 'Builder' })).toBeNull()
  await act(() => useGameDataStore.setState({ isCatalogActivating: false }))
  expect(await screen.findByRole('heading', { name: 'Builder' })).toBeTruthy()
  await expect(useGameDataStore.getState().loadCatalog(source)).resolves.toMatchObject({
    kind: 'rejected',
    message: expect.stringContaining('character workflow'),
  })

  await act(() => useCharacterStore.setState({ isActiveCharacterDirty: true }))
  builder.unmount()
  await expect(useGameDataStore.getState().loadCatalog(source)).resolves.toMatchObject({
    kind: 'rejected',
    message: expect.stringContaining('character workflow'),
  })
})
