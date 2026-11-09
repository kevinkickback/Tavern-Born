import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ipcRenderer } from 'electron'
import { type PropsWithChildren, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '@/App'
import '../../electron/preload'

const bridge = vi.hoisted(() => ({
  expose: vi.fn<(name: string, api: Window['electronAPI']) => void>(),
  invoke: vi.fn(async () => undefined),
  send: vi.fn(),
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    contextBridge: { exposeInMainWorld: bridge.expose },
    ipcRenderer: Object.assign(new EventEmitter(), { invoke: bridge.invoke, send: bridge.send }),
  }
})

// Keep the real application subscription and dialog, without initializing unrelated data or pages.
vi.mock('@/hooks/data/useDataInit', () => ({ useDataInit: () => {} }))
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({
    children,
    onOpenAppUpdate,
  }: PropsWithChildren<{ onOpenAppUpdate?: () => void }>) => (
    <>
      {children}
      {onOpenAppUpdate && (
        <button type="button" onClick={onOpenAppUpdate}>
          App update available
        </button>
      )}
    </>
  ),
}))
vi.mock('@/components/editor/RulesPreviewManager', () => ({
  RulesPreviewManager: ({ children }: PropsWithChildren) => <>{children}</>,
}))
vi.mock('@/components/layout/AppLoadingOverlay', async () => {
  const { useEffect } = await import('react')
  return {
    AppLoadingOverlay: ({ onStartupComplete }: { onStartupComplete?: () => void }) => {
      useEffect(() => onStartupComplete?.(), [onStartupComplete])
      return null
    },
  }
})
vi.mock('@/components/settings/DataSourceStartupModal', () => ({
  DataSourceStartupModal: () => null,
}))
vi.mock('@/components/updates/ChangelogModal', () => ({
  ChangelogModal: ({
    open,
    version,
    onInstall,
  }: {
    open: boolean
    version: string
    onInstall?: () => void
  }) =>
    open ? (
      <button type="button" onClick={onInstall}>
        Install {version}
      </button>
    ) : null,
}))
vi.mock('@/components/updates/UpdateProgressModal', () => ({
  UpdateProgressModal: ({ open, version }: { open: boolean; version: string }) =>
    open ? <p>Downloading {version}</p> : null,
}))
vi.mock('@/pages/HomePage', () => ({ RoutedHomePage: () => <div>Home page</div> }))

const api = bridge.expose.mock.calls.find(([name]) => name === 'electronAPI')?.[1]
if (!api) throw new Error('Preload did not expose electronAPI')

function requestClose() {
  act(() => {
    ipcRenderer.emit('app:confirmClose', { sender: { send: vi.fn() } }, 'unexpected payload')
  })
}

describe('close-confirmation preload and application lifecycle', () => {
  beforeEach(() => {
    ipcRenderer.removeAllListeners()
    vi.clearAllMocks()
    vi.stubGlobal('electronAPI', api)
    window.location.hash = '/'
  })

  afterEach(() => {
    cleanup()
    ipcRenderer.removeAllListeners()
    vi.unstubAllGlobals()
  })

  test('update subscriptions forward only the payload and clean up individually', () => {
    const callback = vi.fn()
    const unsubscribeFirst = api.onUpdateAvailable(callback)
    const unsubscribeSecond = api.onUpdateAvailable(callback)
    const update = { version: '2.0.0', changelog: null, isPortable: true }
    const nativeEvent = { sender: { send: vi.fn() } }

    unsubscribeFirst()
    ipcRenderer.emit('update-available', nativeEvent, update, 'unexpected extra argument')
    unsubscribeSecond()
    ipcRenderer.emit('update-available', nativeEvent, update)

    expect(callback.mock.calls).toEqual([[update]])
  })

  test('keeps an open app update and its download version independent of later checks', async () => {
    const user = userEvent.setup()
    render(<App />)
    const announce = (version: string) => {
      ipcRenderer.emit('update-available', {}, { version, changelog: null, isPortable: false })
    }

    act(() => {
      announce('0.7.0')
    })
    await user.click(screen.getByRole('button', { name: 'App update available' }))
    const install = await screen.findByRole('button', { name: 'Install 0.7.0' })
    act(() => {
      ipcRenderer.emit('update-not-available', {})
    })
    expect(screen.queryByRole('button', { name: 'App update available' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Install 0.7.0' })).toBe(install)

    await user.click(install)
    act(() => {
      announce('0.8.0')
    })
    expect(screen.getByText('Downloading 0.7.0')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'App update available' })).toBeTruthy()
  })

  test('delivers no event or payload and removes the exact wrapper', () => {
    const callback = vi.fn()
    const unsubscribe = api.onConfirmClose(callback)

    ipcRenderer.emit('app:confirmClose', { sender: { send: vi.fn() } }, 'unexpected payload')

    expect(callback.mock.calls).toEqual([[]])
    expect(ipcRenderer.listeners('app:confirmClose')).not.toContain(callback)
    unsubscribe()
    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(0)
    ipcRenderer.emit('app:confirmClose', { sender: {} })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test('cleanup preserves other subscriptions, even for the same callback', () => {
    const callback = vi.fn()
    const otherCallback = vi.fn()
    const first = api.onConfirmClose(callback)
    const second = api.onConfirmClose(callback)
    const other = api.onConfirmClose(otherCallback)

    first()
    first()
    ipcRenderer.emit('app:confirmClose', { sender: {} })

    expect(callback.mock.calls).toEqual([[]])
    expect(otherCallback.mock.calls).toEqual([[]])
    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(2)
    second()
    other()
    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(0)
  })

  test('Strict Mode mount, unmount and remount clean up only the dialog subscription', async () => {
    const otherCallback = vi.fn()
    const unsubscribeOther = api.onConfirmClose(otherCallback)
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await screen.findByText('Home page')
    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(2)

    requestClose()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    view.unmount()
    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(1)

    render(<App />)
    await screen.findByText('Home page')
    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(2)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    requestClose()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(otherCallback.mock.calls).toEqual([[], []])
    cleanup()
    unsubscribeOther()
    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(0)
  })

  test('Cancel keeps the app open and a later close request opens confirmation again', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Home page')

    requestClose()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(bridge.send).not.toHaveBeenCalled()

    requestClose()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(bridge.send).not.toHaveBeenCalled()
  })

  test('Discard & Close sends only the existing force-close command', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Home page')

    requestClose()
    await user.click(screen.getByRole('button', { name: 'Discard & Close' }))

    expect(bridge.send.mock.calls).toEqual([['app:forceClose']])
  })

  test('the application still mounts without an Electron bridge', async () => {
    vi.stubGlobal('electronAPI', undefined)
    const view = render(<App />)
    await screen.findByText('Home page')

    expect(ipcRenderer.listenerCount('app:confirmClose')).toBe(0)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    view.unmount()
  })
})
