import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ChangelogModal } from '@/components/updates/ChangelogModal'
import { UpdateProgressModal } from '@/components/updates/UpdateProgressModal'
import { useCharacterStore } from '@/store/characterStore'

describe('update modals', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('offers a manual download page without presenting an in-app install', async () => {
    const user = userEvent.setup()
    const onOpenDownloadPage = vi.fn()
    render(
      <ChangelogModal
        open
        onOpenChange={vi.fn()}
        version="2.0.0"
        changelog="Portable release notes"
        updateAvailable
        onOpenDownloadPage={onOpenDownloadPage}
      />,
    )

    expect(screen.getByText('Update Available — v2.0.0')).toBeTruthy()
    expect(
      screen.getByText(
        'Download the new version from the release page and replace your current app.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open Download Page' }))
    expect(onOpenDownloadPage).toHaveBeenCalledTimes(1)
  })

  test('returns keyboard focus to the update action when the changelog closes', async () => {
    const user = userEvent.setup()
    function UpdateAction() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            App update available
          </button>
          <ChangelogModal
            open={open}
            onOpenChange={setOpen}
            version="2.0.0"
            changelog="Release notes"
            updateAvailable
            onDownload={vi.fn()}
          />
        </>
      )
    }

    render(<UpdateAction />)
    const action = screen.getByRole('button', { name: 'App update available' })
    action.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.activeElement).toBe(action))
  })

  test('subscribes before downloading and surfaces an IPC start failure', async () => {
    const callOrder: string[] = []
    const subscribe = () => {
      callOrder.push('subscribe')
      return vi.fn()
    }
    const downloadUpdate = vi.fn(() => {
      callOrder.push('download')
      return Promise.resolve({
        success: false,
        data: null,
        error: 'Download service unavailable',
      })
    })

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        downloadUpdate,
        cancelUpdate: vi.fn(),
        installUpdate: vi.fn(),
        onDownloadProgress: subscribe,
        onUpdateDownloaded: subscribe,
        onUpdateError: subscribe,
        onUpdateCancelled: subscribe,
      },
    })

    render(<UpdateProgressModal open version="2.0.0" onOpenChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Update Failed')).toBeTruthy())
    expect(screen.getByText('Download service unavailable')).toBeTruthy()
    expect(callOrder.indexOf('subscribe')).toBeLessThan(callOrder.indexOf('download'))
  })

  test('keeps the cancelled state when the download request rejects afterward', async () => {
    let notifyCancelled: (() => void) | undefined
    let rejectDownload: ((error: Error) => void) | undefined
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        downloadUpdate: vi.fn(
          () =>
            new Promise((_resolve, reject) => {
              rejectDownload = reject
            }),
        ),
        cancelUpdate: vi.fn(),
        installUpdate: vi.fn(),
        onDownloadProgress: vi.fn(() => vi.fn()),
        onUpdateDownloaded: vi.fn(() => vi.fn()),
        onUpdateError: vi.fn(() => vi.fn()),
        onUpdateCancelled: vi.fn((callback: () => void) => {
          notifyCancelled = callback
          return vi.fn()
        }),
      },
    })

    render(<UpdateProgressModal open version="2.0.0" onOpenChange={vi.fn()} />)
    act(() => notifyCancelled?.())
    expect(screen.getByText('Download Cancelled')).toBeTruthy()

    await act(async () => {
      rejectDownload?.(new Error('cancelled'))
      await Promise.resolve()
    })
    expect(screen.getByText('Download Cancelled')).toBeTruthy()
    expect(screen.queryByText('Update Failed')).toBeNull()
  })

  test('can defer a downloaded update and wait for durable save before a requested restart', async () => {
    const user = userEvent.setup()
    let acknowledgeSave: (() => void) | undefined
    let dirty = true
    const store = useCharacterStore.getState()
    vi.spyOn(store, 'hasUnsavedChanges').mockImplementation(() => dirty)
    const save = vi.spyOn(store, 'saveActiveCharacter').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          acknowledgeSave = resolve
        }),
    )
    const installUpdate = vi.fn(async () => undefined)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        downloadUpdate: vi.fn(async () => ({ success: true })),
        installUpdate,
        onDownloadProgress: vi.fn(() => vi.fn()),
        onUpdateError: vi.fn(() => vi.fn()),
        onUpdateCancelled: vi.fn(() => vi.fn()),
      },
    })
    const onOpenChange = vi.fn()
    const modal = (
      <UpdateProgressModal version="2.0.0" open downloaded onOpenChange={onOpenChange} />
    )
    const { rerender } = render(modal)
    await user.click(screen.getByRole('button', { name: 'Later' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(save).not.toHaveBeenCalled()
    expect(installUpdate).not.toHaveBeenCalled()

    rerender(<UpdateProgressModal version="2.0.0" open={false} onOpenChange={onOpenChange} />)
    rerender(modal)
    await user.click(screen.getByRole('button', { name: 'Save and restart' }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(installUpdate).not.toHaveBeenCalled()

    await act(async () => acknowledgeSave?.())
    expect(screen.getByRole('alert').textContent).toMatch(/still has unsaved changes/)
    expect(installUpdate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save and restart' }))
    dirty = false
    await act(async () => acknowledgeSave?.())
    expect(save).toHaveBeenCalledTimes(2)
    expect(installUpdate).toHaveBeenCalledTimes(1)
  })

  test.each([
    'throw',
    'reject',
  ] as const)('reports a download-page callback failure (%s) and allows retry', async (failure) => {
    const user = userEvent.setup()
    const reportError = vi.spyOn(toast, 'error').mockReturnValue('error-toast')
    const onOpenChange = vi.fn()
    const onOpenDownloadPage = vi.fn<() => void | Promise<void>>()
    onOpenDownloadPage.mockImplementationOnce(() => {
      const error = new Error('Browser unavailable')
      if (failure === 'throw') throw error
      return Promise.reject(error)
    })
    render(
      <ChangelogModal
        open
        onOpenChange={onOpenChange}
        version="2.0.0"
        changelog="Release notes"
        updateAvailable
        onOpenDownloadPage={onOpenDownloadPage}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Download Page' }))
    await waitFor(() =>
      expect(reportError).toHaveBeenCalledWith('Could not open the download page', {
        description: 'Browser unavailable',
      }),
    )
    expect(onOpenChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Open Download Page' }))
    expect(onOpenDownloadPage).toHaveBeenCalledTimes(2)
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})
