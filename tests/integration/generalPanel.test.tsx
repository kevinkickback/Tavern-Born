import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GeneralPanel } from '@/components/settings/GeneralPanel'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

function installElectronApi(checkForUpdate: ReturnType<typeof vi.fn>) {
  const unsubscribe = vi.fn()
  const setAutoCheck = vi.fn()
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

describe('general update settings', () => {
  beforeEach(() => {
    useAppPreferencesStore.setState({ autoUpdate: true })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('describes automatic checks without promising automatic installation', async () => {
    const user = userEvent.setup()
    const { setAutoCheck } = installElectronApi(
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

    await user.click(screen.getByRole('switch'))
    expect(setAutoCheck).toHaveBeenCalledWith(false)
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
})
