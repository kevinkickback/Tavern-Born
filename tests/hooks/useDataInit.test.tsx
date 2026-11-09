import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useDataInit } from '@/hooks/data/useDataInit'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'

const original = useGameDataStore.getState()
afterEach(() => {
  useGameDataStore.setState(original)
  vi.restoreAllMocks()
})

test.each([
  false,
  true,
])('startup passes the hydrated automatic-check preference %s', async (enabled) => {
  const loadFromCache = vi.fn(async () => ({}))
  vi.spyOn(useAppPreferencesStore.persist, 'hasHydrated').mockReturnValue(true)
  useAppPreferencesStore.setState({ autoRefreshGameData: enabled })
  useGameDataStore.setState({ hasHydrated: true, gameData: null, isLoading: false, loadFromCache })
  const hook = renderHook(useDataInit)
  await waitFor(() => expect(loadFromCache).toHaveBeenCalledWith({ forceCheck: enabled }))
  hook.rerender()
  expect(loadFromCache).toHaveBeenCalledTimes(1)
})

test('startup waits until source settings are hydrated', () => {
  const loadFromCache = vi.fn(async () => ({}))
  vi.spyOn(useAppPreferencesStore.persist, 'hasHydrated').mockReturnValue(false)
  useGameDataStore.setState({ hasHydrated: true, gameData: null, isLoading: false, loadFromCache })
  renderHook(useDataInit)
  expect(loadFromCache).not.toHaveBeenCalled()
})
