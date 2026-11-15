import { cleanup, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useDataInit } from '@/hooks/data/useDataInit'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'

const original = useGameDataStore.getState()
const originalPreference = useAppPreferencesStore.getState().autoRefreshGameData
afterEach(() => {
  cleanup()
  useGameDataStore.setState(original)
  useAppPreferencesStore.setState({ autoRefreshGameData: originalPreference })
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
  await waitFor(() => expect(loadFromCache).toHaveBeenCalledWith({ checkForUpdates: enabled }))
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

test('checks on focus only while automatic updates are enabled and the hook is mounted', () => {
  const checkCatalogIfDue = vi.fn()
  vi.spyOn(useAppPreferencesStore.persist, 'hasHydrated').mockReturnValue(true)
  useAppPreferencesStore.setState({ autoRefreshGameData: true })
  useGameDataStore.setState({ hasHydrated: true, isLoading: true, checkCatalogIfDue })
  const hook = renderHook(useDataInit)

  fireEvent.focus(window)
  expect(checkCatalogIfDue).toHaveBeenCalledTimes(1)
  hook.unmount()
  fireEvent.focus(window)
  expect(checkCatalogIfDue).toHaveBeenCalledTimes(1)

  useAppPreferencesStore.setState({ autoRefreshGameData: false })
  renderHook(useDataInit)
  fireEvent.focus(window)
  expect(checkCatalogIfDue).toHaveBeenCalledTimes(1)
})
