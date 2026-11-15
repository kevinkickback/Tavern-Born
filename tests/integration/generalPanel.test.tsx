import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GeneralPanel } from '@/components/settings/GeneralPanel'
import { useAppUpdatePreference } from '@/hooks/useAppUpdatePreference'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

const { resetAllHintsMock } = vi.hoisted(() => ({
  resetAllHintsMock: vi.fn(),
}))

vi.mock('@/lib/storage/hints', () => ({
  resetAllHints: resetAllHintsMock,
}))

function installElectronApi(checkForUpdate: ReturnType<typeof vi.fn>) {
  const unsubscribe = vi.fn()
  const setAutoCheck = vi.fn(async (_enabled: boolean) => undefined)
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      getAppVersion: vi.fn(async () => '0.4.0'),
      checkForUpdate,
      setAutoCheck,
      getCurrentChangelog: vi.fn(async () => ({ version: '0.4.0', changelog: null })),
      onUpdateAvailable: vi.fn(() => unsubscribe),
      onUpdateNotAvailable: vi.fn(() => unsubscribe),
      onUpdateError: vi.fn(() => unsubscribe),
    },
  })
  return { setAutoCheck, unsubscribe }
}

function AppUpdateSettings() {
  useAppUpdatePreference()
  return <GeneralPanel />
}

describe('general update settings', () => {
  beforeEach(() => {
    useAppPreferencesStore.setState({ autoUpdate: true })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  test.each([
    false,
    true,
    undefined,
  ])('waits for the stored automatic update preference %s before configuring the updater', async (autoUpdate) => {
    const user = userEvent.setup()
    const checkForUpdate = vi.fn(async () => ({
      success: true,
      data: { status: 'not-available' },
      error: null,
    }))
    const { setAutoCheck } = installElectronApi(checkForUpdate)
    const storage = useAppPreferencesStore.persist.getOptions().storage!
    let resolveStored!: (value: Awaited<ReturnType<typeof storage.getItem>>) => void
    const stored = new Promise<Awaited<ReturnType<typeof storage.getItem>>>((resolve) => {
      resolveStored = resolve
    })
    vi.spyOn(storage, 'getItem').mockReturnValue(stored)
    const hydration = useAppPreferencesStore.persist.rehydrate()

    render(<AppUpdateSettings />)
    const toggle = screen.getByRole('switch')
    expect(toggle.hasAttribute('disabled')).toBe(true)
    expect(setAutoCheck).not.toHaveBeenCalled()

    await act(async () => {
      resolveStored(autoUpdate === undefined ? null : { state: { autoUpdate }, version: 0 })
      await hydration
    })
    const enabled = autoUpdate ?? true
    expect(setAutoCheck.mock.calls).toEqual([[enabled]])
    expect(toggle.getAttribute('aria-checked')).toBe(String(enabled))
    expect(toggle.hasAttribute('disabled')).toBe(false)

    await user.click(toggle)
    await user.click(toggle)
    expect(setAutoCheck.mock.calls).toEqual([[enabled], [!enabled], [enabled]])

    if (!enabled) {
      await user.click(screen.getByRole('button', { name: 'Check Now' }))
      expect(checkForUpdate).toHaveBeenCalledTimes(1)
      expect(await screen.findByRole('button', { name: 'Up to Date' })).toBeTruthy()
    }
  })

  test('describes automatic checks without promising automatic installation', () => {
    installElectronApi(
      vi.fn(async () => ({ success: true, data: { status: 'not-available' }, error: null })),
    )

    render(<GeneralPanel />)

    expect(screen.getByText('Automatically Check for Updates')).toBeTruthy()
    expect(
      screen.getByText(
        'Check for new releases when Tavern Born starts and notify you when one is available.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/install updates automatically/i)).toBeNull()
  })

  test('finishes a manual check and displays a returned updater error', async () => {
    const checkForUpdate = vi.fn(async () => ({
      success: true,
      data: { status: 'error', error: 'Signature validation failed' },
      error: null,
    }))
    const { unsubscribe } = installElectronApi(checkForUpdate)

    render(<GeneralPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Check Now' }))

    expect(await screen.findByText('Error: Signature validation failed')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check Now' }).hasAttribute('disabled')).toBe(
        false,
      ),
    )
    expect(unsubscribe).toHaveBeenCalledTimes(3)
  })

  test('finishes a manual check when the IPC request rejects', async () => {
    installElectronApi(vi.fn(async () => Promise.reject(new Error('IPC unavailable'))))

    render(<GeneralPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Check Now' }))

    expect(await screen.findByText('Error: IPC unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check Now' }).hasAttribute('disabled')).toBe(false)
  })

  test('resets dismissed one-time hints from settings', async () => {
    installElectronApi(
      vi.fn(async () => ({ success: true, data: { status: 'not-available' }, error: null })),
    )

    render(<GeneralPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(resetAllHintsMock).toHaveBeenCalledTimes(1)
  })
})
