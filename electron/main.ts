import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  session,
  shell,
} from 'electron'
import { isPathWithinRoot, isTrustedRendererUrl } from './security'
import {
  cancelDownload,
  checkForUpdate,
  downloadUpdate,
  fetchChangelog,
  getUpdateStatus,
  initAutoUpdater,
  installUpdate,
  openPortableUpdatePage,
  startAutoCheckSchedule,
  stopAutoCheckSchedule,
} from './updateManager'
import { attachWindowStatePersistence, loadWindowState, MIN_HEIGHT, MIN_WIDTH } from './windowState'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let hasUnsavedChanges = false
let forceClose = false
let localDataRootPath: string | null = null

const isDev = !!process.env.VITE_DEV_SERVER_URL
const LOCAL_DATA_AUTH_FILE = 'trusted-data-root.json'
const MAX_LOCAL_JSON_BYTES = 50 * 1024 * 1024

type TrustedIpcEvent = IpcMainEvent | IpcMainInvokeEvent

function isTrustedIpcSender(event: TrustedIpcEvent): boolean {
  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame !== event.sender.mainFrame) return false

  const rendererRoot = pathToFileURL(join(__dirname, '../dist') + sep).href
  return isTrustedRendererUrl(
    senderFrame.url,
    rendererRoot,
    isDev ? process.env.VITE_DEV_SERVER_URL : undefined,
  )
}

function assertTrustedIpcSender(event: TrustedIpcEvent): void {
  if (!isTrustedIpcSender(event)) throw new Error('IPC request rejected: untrusted sender')
}

function getLocalDataAuthPath(): string {
  return join(app.getPath('userData'), LOCAL_DATA_AUTH_FILE)
}

async function loadAuthorizedLocalDataRoot(): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(getLocalDataAuthPath(), 'utf-8')) as {
      rootPath?: unknown
    }
    if (typeof parsed.rootPath !== 'string' || !isAbsolute(parsed.rootPath)) return null
    return normalize(await realpath(parsed.rootPath))
  } catch {
    return null
  }
}

async function authorizeLocalDataRoot(folderPath: string): Promise<string> {
  const canonicalPath = normalize(await realpath(folderPath))
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(
    getLocalDataAuthPath(),
    JSON.stringify({ rootPath: canonicalPath }, null, 2),
    'utf-8',
  )
  localDataRootPath = canonicalPath
  return canonicalPath
}

function isDevToolsShortcut(input: Electron.Input): boolean {
  const key = input.key.toLowerCase()
  return (
    key === 'f12' ||
    ((input.control || input.meta) && input.shift && ['c', 'i', 'j'].includes(key)) ||
    (input.meta && input.alt && ['c', 'i', 'j'].includes(key))
  )
}

async function createWindow(): Promise<void> {
  const windowState = await loadWindowState()
  forceClose = false

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    useContentSize: true,
    center: windowState.x === undefined || windowState.y === undefined,
    ...(windowState.x !== undefined ? { x: windowState.x } : {}),
    ...(windowState.y !== undefined ? { y: windowState.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: '#111113',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#111113',
            symbolColor: '#fafafa',
            height: 32,
          },
        }),
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: isDev,
      webviewTag: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
    },
    show: false,
    autoHideMenuBar: true,
    title: 'Tavern Born',
  })

  if (!isDev) {
    mainWindow.removeMenu()
    mainWindow.setMenuBarVisibility(false)
  }

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  attachWindowStatePersistence(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = ['http://localhost:', `file://${__dirname}`]
    const isAllowed = allowedOrigins.some((origin) => url.startsWith(origin))
    if (!isAllowed) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === 'https:') void shell.openExternal(url)
    } catch {
      // Invalid and non-HTTPS destinations remain blocked.
    }
    return { action: 'deny' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (hasUnsavedChanges && !forceClose) {
      event.preventDefault()
      mainWindow?.webContents.send('app:confirmClose')
    }
  })
}

app.on('ready', async () => {
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            isDev ? "connect-src 'self' ws://localhost:* https:" : "connect-src 'self' https:",
            "worker-src 'self' blob:",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        ],
      },
    })
  })

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  localDataRootPath = await loadAuthorizedLocalDataRoot()
  initAutoUpdater()

  ipcMain.handle('dialog:selectFolder', async (event) => {
    assertTrustedIpcSender(event)
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
        })
    if (result.canceled || result.filePaths.length === 0) return null
    return authorizeLocalDataRoot(result.filePaths[0])
  })

  ipcMain.handle('fs:readJson', async (event, filePath: unknown) => {
    assertTrustedIpcSender(event)
    if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
      throw new Error('Path must be absolute')
    }
    if (extname(filePath).toLowerCase() !== '.json') {
      throw new Error('Only JSON files may be read')
    }

    if (!localDataRootPath) {
      throw new Error('No local data directory configured. Select a folder first.')
    }

    const canonicalRoot = normalize(await realpath(localDataRootPath))
    const canonicalTarget = normalize(await realpath(filePath))
    if (!isPathWithinRoot(canonicalRoot, canonicalTarget)) {
      throw new Error('Access denied: path is outside the configured data directory.')
    }

    const fileStats = await stat(canonicalTarget)
    if (!fileStats.isFile()) throw new Error('Path does not reference a file')
    if (fileStats.size > MAX_LOCAL_JSON_BYTES) {
      throw new Error('JSON file exceeds the 50 MB safety limit')
    }

    const content = await readFile(canonicalTarget, 'utf-8')
    return JSON.parse(content)
  })
  ipcMain.on('state:setUnsavedChanges', (event, value: unknown) => {
    if (!isTrustedIpcSender(event)) return
    hasUnsavedChanges = !!value
  })

  ipcMain.on('app:forceClose', (event) => {
    if (!isTrustedIpcSender(event)) return
    forceClose = true
    mainWindow?.close()
  })

  ipcMain.on(
    'window:set-title-bar-overlay',
    (event, colors: { color?: unknown; symbolColor?: unknown; height?: unknown }) => {
      if (!isTrustedIpcSender(event)) return
      if (process.platform === 'darwin') return

      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      if (!senderWindow || senderWindow !== mainWindow) return

      const color = typeof colors?.color === 'string' ? colors.color : ''
      const symbolColor = typeof colors?.symbolColor === 'string' ? colors.symbolColor : ''
      const requestedHeight = typeof colors?.height === 'number' ? colors.height : 32
      const height = Math.min(48, Math.max(24, Math.round(requestedHeight)))
      const hexColor = /^#[0-9a-f]{6}$/i
      if (!hexColor.test(color) || !hexColor.test(symbolColor)) return

      senderWindow.setTitleBarOverlay({ color, symbolColor, height })
    },
  )

  ipcMain.handle('update:check', async (event) => {
    assertTrustedIpcSender(event)
    try {
      const status = await checkForUpdate()
      return { success: true, data: status, error: null }
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message }
    }
  })

  ipcMain.handle('update:download', async (event) => {
    assertTrustedIpcSender(event)
    try {
      await downloadUpdate()
      return { success: true, data: null, error: null }
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message }
    }
  })

  ipcMain.handle('update:open-portable-page', async (event) => {
    assertTrustedIpcSender(event)
    try {
      await openPortableUpdatePage()
      return { success: true, data: null, error: null }
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message }
    }
  })

  ipcMain.handle('update:cancel', (event) => {
    assertTrustedIpcSender(event)
    const cancelled = cancelDownload()
    return { success: cancelled, data: null, error: cancelled ? null : 'No download in progress' }
  })

  ipcMain.handle('update:install', (event) => {
    assertTrustedIpcSender(event)
    installUpdate()
  })

  ipcMain.handle('update:status', (event) => {
    assertTrustedIpcSender(event)
    return getUpdateStatus()
  })

  ipcMain.handle('update:set-auto-check', (event, enabled: unknown) => {
    assertTrustedIpcSender(event)
    if (typeof enabled !== 'boolean') return
    if (enabled) startAutoCheckSchedule()
    else stopAutoCheckSchedule()
  })

  ipcMain.handle('update:get-version', (event) => {
    assertTrustedIpcSender(event)
    return app.getVersion()
  })

  ipcMain.handle('update:get-current-changelog', async (event) => {
    assertTrustedIpcSender(event)
    const version = app.getVersion()
    const changelog = await fetchChangelog(version)
    return { version, changelog }
  })

  await createWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('web-contents-created', (_event, contents) => {
  if (!isDev) {
    contents.on('before-input-event', (event, input) => {
      if (isDevToolsShortcut(input)) {
        event.preventDefault()
      }
    })
    contents.on('devtools-opened', () => contents.closeDevTools())
  }

  contents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})
