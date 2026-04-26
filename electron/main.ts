import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import {
  cancelDownload,
  checkForUpdate,
  downloadUpdate,
  fetchChangelog,
  getUpdateStatus,
  initAutoUpdater,
  installUpdate,
  startAutoCheckSchedule,
  stopAutoCheckSchedule,
} from './updateManager'
import { attachWindowStatePersistence, loadWindowState, MIN_HEIGHT, MIN_WIDTH } from './windowState'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let hasUnsavedChanges = false
let forceClose = false
/**
 * The base directory the user configured for local 5etools data files.
 * Set whenever the renderer calls `dialog:selectFolder` or
 * `config:setLocalDataPath`. Only paths under this directory may be read
 * via `fs:readJson`.
 */
let allowedLocalDataPath: string | null = null

const isDev = !!process.env.VITE_DEV_SERVER_URL

async function createWindow(): Promise<void> {
  const windowState = await loadWindowState()

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
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      // Security best practices
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
    },
    show: false,
    autoHideMenuBar: true,
    title: 'Tavern Born',
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  attachWindowStatePersistence(mainWindow)

  // Show window once content is ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // --- Security: Restrict navigation ---
  // Only allow navigation to the app's own URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = ['http://localhost:', `file://${__dirname}`]
    const isAllowed = allowedOrigins.some((origin) => url.startsWith(origin))
    if (!isAllowed) {
      event.preventDefault()
    }
  })

  // --- Security: Open external links in the default browser ---
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Load the app
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

  initAutoUpdater()
}

// --- Security: Content Security Policy ---
app.on('ready', () => {
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

  // --- Security: Deny all permission requests ---
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  void createWindow()

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
        })
    if (result.canceled || result.filePaths.length === 0) return null
    const selected = result.filePaths[0]
    // Track the selected directory as the allowed base for local file reads.
    allowedLocalDataPath = normalize(selected)
    return selected
  })

  // Called by the renderer when a previously-configured local data path is
  // restored from persisted state (e.g. on app startup) so the main process
  // can enforce path constraints without requiring the user to re-select.
  ipcMain.on('config:setLocalDataPath', (_event, folderPath: unknown) => {
    if (typeof folderPath === 'string' && isAbsolute(folderPath)) {
      allowedLocalDataPath = normalize(folderPath)
    }
  })

  ipcMain.handle('fs:readJson', async (_event, filePath: string) => {
    if (!isAbsolute(filePath)) throw new Error('Path must be absolute')
    const normalized = normalize(filePath)

    // Path-containment guard: only allow reads from within the configured
    // local data directory. This prevents renderer XSS or compromised code
    // from reading arbitrary host files (SSH keys, credentials, etc.).
    if (!allowedLocalDataPath) {
      throw new Error('No local data directory configured. Select a folder first.')
    }
    const base = allowedLocalDataPath.endsWith(sep)
      ? allowedLocalDataPath
      : allowedLocalDataPath + sep
    if (!normalized.startsWith(base)) {
      throw new Error('Access denied: path is outside the configured data directory.')
    }

    const content = await readFile(normalized, 'utf-8')
    return JSON.parse(content)
  })
  ipcMain.on('state:setUnsavedChanges', (_event, value: boolean) => {
    hasUnsavedChanges = !!value
  })

  ipcMain.on('app:forceClose', () => {
    forceClose = true
    mainWindow?.close()
  })

  ipcMain.handle('update:check', async () => {
    try {
      const status = await checkForUpdate()
      return { success: true, data: status, error: null }
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message }
    }
  })

  ipcMain.handle('update:download', async () => {
    try {
      await downloadUpdate()
      return { success: true, data: null, error: null }
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message }
    }
  })

  ipcMain.handle('update:cancel', () => {
    const cancelled = cancelDownload()
    return { success: cancelled, data: null, error: cancelled ? null : 'No download in progress' }
  })

  ipcMain.handle('update:install', () => {
    installUpdate()
  })

  ipcMain.handle('update:status', () => {
    return getUpdateStatus()
  })

  ipcMain.handle('update:set-auto-check', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return
    if (enabled) startAutoCheckSchedule()
    else stopAutoCheckSchedule()
  })

  ipcMain.handle('update:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('update:get-current-changelog', async () => {
    const version = app.getVersion()
    const changelog = await fetchChangelog(version)
    return { version, changelog }
  })
})

// macOS: Re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- Security: Prevent creation of additional WebContents ---
app.on('web-contents-created', (_event, contents) => {
  // Prevent navigation in any new webContents
  contents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // Deny all new window/tab creation from child contents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})
