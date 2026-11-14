import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const {
  appState,
  netState,
  netFetchMock,
  shellOpenExternalMock,
  checkForUpdatesMock,
  downloadUpdateMock,
  quitAndInstallMock,
  onMock,
  cancelMock,
  rendererSendMock,
  windowState,
} = vi.hoisted(() => ({
  appState: {
    isPackaged: false,
    version: '1.0.0',
  },
  netState: {
    online: true,
  },
  netFetchMock: vi.fn(),
  shellOpenExternalMock: vi.fn(),
  checkForUpdatesMock: vi.fn(),
  downloadUpdateMock: vi.fn(),
  quitAndInstallMock: vi.fn(),
  onMock: vi.fn(),
  cancelMock: vi.fn(),
  rendererSendMock: vi.fn(),
  windowState: {
    windows: [] as Array<{
      isDestroyed: () => boolean
      webContents: { send: (...args: unknown[]) => void }
    }>,
  },
}))

vi.mock('electron', () => ({
  app: {
    getVersion: () => appState.version,
    get isPackaged() {
      return appState.isPackaged
    },
  },
  BrowserWindow: {
    getAllWindows: () => windowState.windows,
  },
  net: {
    fetch: netFetchMock,
    isOnline: () => netState.online,
  },
  shell: {
    openExternal: shellOpenExternalMock,
  },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    on: onMock,
    checkForUpdates: checkForUpdatesMock,
    downloadUpdate: downloadUpdateMock,
    quitAndInstall: quitAndInstallMock,
  },
  CancellationToken: class {
    cancelled = false
    cancel() {
      this.cancelled = true
      cancelMock()
    }
  },
}))

import {
  cancelDownload,
  checkForUpdate,
  compareSemver,
  downloadUpdate,
  getUpdateStatus,
  initAutoUpdater,
  installUpdate,
  openUpdateDownloadPage,
  startAutoCheckSchedule,
  stopAutoCheckSchedule,
} from '../../electron/updateManager'

function updaterHandler(eventName: string): (...args: never[]) => unknown {
  const registration = onMock.mock.calls.find(([event]) => event === eventName)
  expect(registration, `expected ${eventName} listener to be registered`).toBeDefined()
  return registration?.[1] as (...args: never[]) => unknown
}

describe('compareSemver', () => {
  test('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
  })

  test('returns 1 when a is newer by patch', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1)
  })

  test('returns -1 when a is older by patch', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1)
  })

  test('returns 1 when a is newer by minor', () => {
    expect(compareSemver('1.1.0', '1.0.9')).toBe(1)
  })

  test('returns 1 when a is newer by major', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
  })

  test('release is newer than pre-release of same version', () => {
    // 1.0.0 > 1.0.0-beta.1
    expect(compareSemver('1.0.0', '1.0.0-beta.1')).toBe(1)
  })

  test('pre-release is older than stable release', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1)
  })

  test('later pre-release tag is greater than earlier one', () => {
    expect(compareSemver('1.0.0-beta', '1.0.0-alpha')).toBe(1)
  })

  test('compares numeric pre-release identifiers numerically', () => {
    expect(compareSemver('1.0.0-beta.10', '1.0.0-beta.2')).toBe(1)
  })

  test('numeric pre-release identifiers sort before non-numeric identifiers', () => {
    expect(compareSemver('1.0.0-1', '1.0.0-alpha')).toBe(-1)
  })

  test('a longer matching pre-release sequence has higher precedence', () => {
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1)
  })

  test('ignores build metadata and accepts a v prefix', () => {
    expect(compareSemver('v1.0.0+build.2', '1.0.0+build.1')).toBe(0)
  })

  test('handles missing patch component', () => {
    expect(compareSemver('1.1', '1.0.9')).toBe(1)
  })
})

describe('updateManager offline safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    appState.isPackaged = true
    appState.version = '1.0.0'
    netState.online = true
    stopAutoCheckSchedule()
  })

  afterEach(() => {
    stopAutoCheckSchedule()
    vi.useRealTimers()
  })

  test('checkForUpdate reports an offline error without calling electron-updater', async () => {
    netState.online = false

    const result = await checkForUpdate()

    expect(result).toEqual({
      status: 'error',
      error: 'No internet connection. Check your connection and try again.',
    })
    expect(getUpdateStatus()).toEqual(result)
    expect(checkForUpdatesMock).not.toHaveBeenCalled()
  })

  test('startup auto-check schedule skips updater calls while offline', async () => {
    netState.online = false
    initAutoUpdater()
    startAutoCheckSchedule()

    await vi.advanceTimersByTimeAsync(3000)

    expect(checkForUpdatesMock).not.toHaveBeenCalled()
    expect(getUpdateStatus().status).toBe('error')
  })
})

describe('installUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PORTABLE_EXECUTABLE_DIR
    initAutoUpdater()
  })

  test('installs silently and relaunches the packaged app', () => {
    appState.isPackaged = true

    installUpdate()

    expect(quitAndInstallMock).toHaveBeenCalledWith(true, true)
  })

  test('does not invoke the installer during development', () => {
    appState.isPackaged = false

    installUpdate()

    expect(quitAndInstallMock).not.toHaveBeenCalled()
  })
})

describe('update event lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appState.isPackaged = true
    netState.online = true
    delete process.env.PORTABLE_EXECUTABLE_DIR
    windowState.windows = [
      {
        isDestroyed: () => false,
        webContents: { send: rendererSendMock },
      },
    ]
    initAutoUpdater()
  })

  afterEach(() => {
    windowState.windows = []
  })

  test('forwards checking, progress, and downloaded events with renderer-safe payloads', () => {
    updaterHandler('checking-for-update')()
    expect(getUpdateStatus()).toEqual({ status: 'checking' })
    expect(rendererSendMock).toHaveBeenLastCalledWith('update-checking', undefined)

    const progress = {
      percent: 42.5,
      bytesPerSecond: 2_000,
      total: 10_000,
      transferred: 4_250,
    }
    updaterHandler('download-progress')(progress as never)
    expect(getUpdateStatus()).toEqual({ status: 'downloading', progress })
    expect(rendererSendMock).toHaveBeenLastCalledWith('download-progress', {
      percentage: 42.5,
      bytesPerSecond: 2_000,
      total: 10_000,
      transferred: 4_250,
    })

    updaterHandler('update-downloaded')({ version: '2.0.0' } as never)
    expect(getUpdateStatus()).toEqual({ status: 'downloaded', version: '2.0.0' })
    expect(rendererSendMock).toHaveBeenLastCalledWith('update-downloaded', { version: '2.0.0' })
  })

  test('forwards update availability with changelog and install-mode metadata', async () => {
    netFetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ body: 'Detailed release notes' }),
    })

    await updaterHandler('update-available')({ version: '2.1.0' } as never)

    expect(getUpdateStatus()).toEqual({
      status: 'available',
      version: '2.1.0',
      changelog: 'Detailed release notes',
    })
    expect(rendererSendMock).toHaveBeenLastCalledWith('update-available', {
      version: '2.1.0',
      changelog: 'Detailed release notes',
      useReleaseDownloadPage: false,
    })
  })

  test('reports connectivity and updater failures as errors', () => {
    updaterHandler('error')(new Error('network timed out') as never)
    expect(getUpdateStatus()).toEqual({
      status: 'error',
      error: 'No internet connection. Check your connection and try again.',
    })
    expect(rendererSendMock).toHaveBeenLastCalledWith('update-error', {
      message: 'No internet connection. Check your connection and try again.',
    })

    updaterHandler('error')(new Error('signature validation failed') as never)
    expect(getUpdateStatus()).toEqual({
      status: 'error',
      error: 'signature validation failed',
    })
    expect(rendererSendMock).toHaveBeenLastCalledWith('update-error', {
      message: 'signature validation failed',
    })
  })

  test('does not send events to a destroyed window', () => {
    windowState.windows = [
      {
        isDestroyed: () => true,
        webContents: { send: rendererSendMock },
      },
    ]

    updaterHandler('update-not-available')({} as never)

    expect(getUpdateStatus()).toEqual({ status: 'not-available' })
    expect(rendererSendMock).not.toHaveBeenCalled()
  })
})

describe('download cancellation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appState.isPackaged = true
    netState.online = true
    delete process.env.PORTABLE_EXECUTABLE_DIR
    windowState.windows = [
      {
        isDestroyed: () => false,
        webContents: { send: rendererSendMock },
      },
    ]
    initAutoUpdater()
  })

  afterEach(() => {
    cancelDownload()
    windowState.windows = []
  })

  test('starts only one updater download while a request is in flight and cancels it once', async () => {
    let rejectDownload: ((error: Error) => void) | undefined
    downloadUpdateMock.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDownload = reject
        }),
    )

    const firstDownload = downloadUpdate()
    await downloadUpdate()

    expect(downloadUpdateMock).toHaveBeenCalledTimes(1)
    expect(cancelDownload()).toBe(true)
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(getUpdateStatus()).toEqual({ status: 'idle' })
    expect(rendererSendMock).toHaveBeenLastCalledWith('update-cancelled', undefined)
    expect(cancelDownload()).toBe(false)

    rejectDownload?.(new Error('cancelled'))
    await expect(firstDownload).resolves.toBeUndefined()
  })

  test('clears the cancellation handle after a completed download', async () => {
    downloadUpdateMock.mockResolvedValueOnce(undefined)

    await downloadUpdate()

    expect(downloadUpdateMock).toHaveBeenCalledTimes(1)
    expect(cancelDownload()).toBe(false)
    expect(cancelMock).not.toHaveBeenCalled()
  })
})

describe.each(['macOS', 'Windows Portable'])('%s release download', (build) => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')
  const nodeFetchMock = vi.fn()
  const releaseFetchMock = build === 'macOS' ? nodeFetchMock : netFetchMock

  beforeEach(() => {
    vi.clearAllMocks()
    appState.isPackaged = true
    netState.online = true
    vi.stubEnv(
      'PORTABLE_EXECUTABLE_DIR',
      build === 'Windows Portable' ? 'C:/Portable/Tavern-Born' : undefined,
    )
    Object.defineProperty(process, 'platform', { value: build === 'macOS' ? 'darwin' : 'win32' })
    vi.stubGlobal('fetch', nodeFetchMock)
    initAutoUpdater()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    if (platform) Object.defineProperty(process, 'platform', platform)
    initAutoUpdater()
  })

  test('never uses the native updater', async () => {
    await expect(downloadUpdate()).rejects.toThrow(
      'Install this update from the release download page',
    )
    installUpdate()

    expect(downloadUpdateMock).not.toHaveBeenCalled()
    expect(quitAndInstallMock).not.toHaveBeenCalled()
    expect(onMock).not.toHaveBeenCalled()
  })

  test('opens the exact GitHub release page after an update is found', async () => {
    releaseFetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v2.0.0', body: 'Release notes' }),
    })
    await expect(checkForUpdate()).resolves.toEqual({
      status: 'available',
      version: '2.0.0',
      changelog: 'Release notes',
    })
    expect(checkForUpdatesMock).not.toHaveBeenCalled()
    expect(releaseFetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/kevinkickback/Tavern-Born/releases/latest',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    if (build === 'macOS') {
      expect(releaseFetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    }

    await openUpdateDownloadPage()

    expect(shellOpenExternalMock).toHaveBeenCalledWith(
      'https://github.com/kevinkickback/Tavern-Born/releases/tag/v2.0.0',
    )
  })

  test('refuses to open a download page before an update is available', async () => {
    releaseFetchMock.mockResolvedValueOnce({ ok: false })
    await checkForUpdate()

    await expect(openUpdateDownloadPage()).rejects.toThrow('No update is currently available')
    expect(shellOpenExternalMock).not.toHaveBeenCalled()
  })

  test('reports network failures without falling through to the native updater', async () => {
    releaseFetchMock.mockRejectedValueOnce(
      build === 'macOS' ? new TypeError('fetch failed') : new Error('net::ERR_CONNECTION_RESET'),
    )
    await expect(checkForUpdate()).resolves.toEqual({
      status: 'error',
      error:
        build === 'macOS'
          ? 'Could not reach the update server. Check your connection and try again.'
          : 'No internet connection. Check your connection and try again.',
    })
    expect(checkForUpdatesMock).not.toHaveBeenCalled()
  })
})
