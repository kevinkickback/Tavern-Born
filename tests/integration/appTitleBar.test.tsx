import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppTitleBar } from '@/components/layout/AppTitleBar'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('Windows title-bar overlay', () => {
  const setTitleBarOverlay = vi.fn()

  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { setTitleBarOverlay },
    })
    useAppPreferencesStore.setState({ themeAppearance: 'dark', uiScale: 120 })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('uses the shell color and scales the native caption-control height', async () => {
    render(<AppTitleBar />)

    await waitFor(() => expect(setTitleBarOverlay).toHaveBeenCalledWith('#111113', '#fafafa', 38))
  })

  test('keeps the native overlay aligned with the softened light shell', async () => {
    useAppPreferencesStore.setState({ themeAppearance: 'light', uiScale: 100 })

    render(<AppTitleBar />)

    await waitFor(() => expect(setTitleBarOverlay).toHaveBeenCalledWith('#cdced6', '#1c2024', 32))
  })
})
