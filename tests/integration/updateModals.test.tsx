import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ChangelogModal } from '@/components/updates/ChangelogModal'
import { UpdateProgressModal } from '@/components/updates/UpdateProgressModal'

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
      screen.getByText('A new version is available. Portable builds do not update in place.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install Now' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open Download Page' }))
    expect(onOpenDownloadPage).toHaveBeenCalledTimes(1)
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
})
