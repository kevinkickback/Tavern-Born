import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
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
import type { CatalogRequestMessage } from '@/lib/5etools/catalogProtocol'
import {
  assertBundledManifestAllowed,
  type BundledSrdManifestSummary,
  readBundledJsonText,
  readBundledManifestFromRoot,
  resolveBundledPackRoot,
} from './bundledResources'
import { createCatalogService } from './catalogService'
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
import {
  attachWindowStatePersistence,
  flushWindowStateWrites,
  loadWindowState,
  MIN_HEIGHT,
  MIN_WIDTH,
} from './windowState'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const RENDERER_ROOT_URL = pathToFileURL(join(__dirname, '../dist') + sep).href

let mainWindow: BrowserWindow | null = null
let hasUnsavedChanges = false
let forceClose = false
let localDataRoots = new Set<string>()
let selectingLocalDataRoot = false
let pendingLocalDataRoot: string | null = null
let localGrantGeneration = 0
let bundledManifestCache: {
  rootPath: string
  promise: Promise<BundledSrdManifestSummary>
} | null = null

const isDev = !!process.env.VITE_DEV_SERVER_URL
const LOCAL_DATA_AUTH_FILE = 'trusted-data-root.json'
const MAX_LOCAL_JSON_BYTES = 50 * 1024 * 1024

// Vite's optimized dependency responses are intentionally immutable. Electron's persistent
// HTTP cache can otherwise retain one of those responses after Vite regenerates its shared
// chunks, leaving lazy routes pointed at an obsolete chunk until the cache is cleared manually.
if (isDev) app.commandLine.appendSwitch('disable-http-cache')

type TrustedIpcEvent = IpcMainEvent | IpcMainInvokeEvent

function isTrustedIpcSender(event: TrustedIpcEvent): boolean {
  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame !== event.sender.mainFrame) return false

  return isTrustedRendererUrl(
    senderFrame.url,
    RENDERER_ROOT_URL,
    isDev ? process.env.VITE_DEV_SERVER_URL : undefined,
  )
}

function assertTrustedIpcSender(event: TrustedIpcEvent): void {
  if (!isTrustedIpcSender(event)) throw new Error('IPC request rejected: untrusted sender')
}

function checkLocalRoot(root: unknown): asserts root is string {
  if (typeof root !== 'string' || (!localDataRoots.has(root) && root !== pendingLocalDataRoot)) {
    throw new Error('Select the local data directory first.')
  }
}

async function readLocalJsonText(filePath: unknown, root: unknown): Promise<string> {
  if (typeof filePath !== 'string' || !isAbsolute(filePath))
    throw new Error('Path must be absolute')
  if (extname(filePath).toLowerCase() !== '.json') throw new Error('Only JSON files may be read')
  checkLocalRoot(root)
  if (!isPathWithinRoot(root, normalize(filePath)))
    throw new Error('Access denied: path is outside the configured data directory.')
  const canonicalTarget = normalize(
    await realpath(filePath).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        const rootStats = await stat(root).catch(() => null)
        if (!rootStats?.isDirectory()) throw new Error('The selected data folder is unavailable.')
      }
      throw error
    }),
  )
  if (!isPathWithinRoot(root, canonicalTarget))
    throw new Error('Access denied: path is outside the configured data directory.')

  try {
    const fileStats = await stat(canonicalTarget)
    if (!fileStats.isFile()) throw new Error('Path does not reference a file')
    if (fileStats.size > MAX_LOCAL_JSON_BYTES)
      throw new Error('JSON file exceeds the 50 MB safety limit')
    return await readFile(canonicalTarget, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error('The file moved during the check. Try checking the source again.')
    throw error
  }
}

function getLocalDataAuthPath(): string {
  return join(app.getPath('userData'), LOCAL_DATA_AUTH_FILE)
}

async function loadAuthorizedLocalDataRoots(): Promise<Set<string>> {
  try {
    const stored = JSON.parse(await readFile(getLocalDataAuthPath(), 'utf-8'))
    const roots: unknown[] = Array.isArray(stored.rootPaths) ? stored.rootPaths : [stored.rootPath]
    return new Set(
      roots
        .filter((path): path is string => typeof path === 'string' && isAbsolute(path))
        .map(normalize),
    )
  } catch {
    return new Set()
  }
}

async function approveLocalDataRoot(root: unknown): Promise<void> {
  if (typeof root !== 'string') throw new Error('Invalid data directory')
  if (localDataRoots.has(root)) return
  if (root !== pendingLocalDataRoot) throw new Error('Select the data directory again.')
  const roots = new Set([...localDataRoots, root])
  const path = getLocalDataAuthPath()
  await mkdir(app.getPath('userData'), { recursive: true })
  const pendingPath = `${path}.tmp`
  await writeFile(pendingPath, JSON.stringify({ rootPaths: [...roots] }), 'utf-8')
  await rename(pendingPath, path)
  localDataRoots = roots
}

function getBundledPackRoot(): string {
  return resolveBundledPackRoot({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repositoryRoot: join(__dirname, '..'),
  })
}

async function getAllowedBundledManifest(): Promise<{
  manifest: BundledSrdManifestSummary
  rootPath: string
}> {
  const rootPath = getBundledPackRoot()
  if (bundledManifestCache?.rootPath !== rootPath) {
    const promise = readBundledManifestFromRoot(rootPath).then((manifest) => {
      assertBundledManifestAllowed(manifest, { isPackaged: app.isPackaged })
      return manifest
    })
    bundledManifestCache = { rootPath, promise }
  }

  try {
    return { manifest: await bundledManifestCache.promise, rootPath }
  } catch (error) {
    if (bundledManifestCache?.rootPath === rootPath) bundledManifestCache = null
    throw error
  }
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

  localDataRoots = await loadAuthorizedLocalDataRoots()
  initAutoUpdater()

  ipcMain.handle('dialog:selectFolder', async (event) => {
    assertTrustedIpcSender(event)
    if (selectingLocalDataRoot) return null
    selectingLocalDataRoot = true
    try {
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
          })
        : await dialog.showOpenDialog({
            properties: ['openDirectory'],
          })
      if (result.canceled || result.filePaths.length === 0) return null
      pendingLocalDataRoot = normalize(await realpath(result.filePaths[0]))
      localGrantGeneration += 1
      return pendingLocalDataRoot
    } finally {
      selectingLocalDataRoot = false
    }
  })

  ipcMain.handle('character:save-file', async (event, filename: unknown, text: unknown) => {
    assertTrustedIpcSender(event)
    const ownerWindow = mainWindow
    if (!ownerWindow || event.sender !== ownerWindow.webContents) return false
    if (
      typeof filename !== 'string' ||
      !filename.endsWith('.tbc') ||
      /[<>:"/\\|?*]/.test(filename) ||
      Array.from(filename).some((char) => char.charCodeAt(0) < 32) ||
      typeof text !== 'string'
    ) {
      throw new TypeError('Invalid character export.')
    }
    const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow, {
      defaultPath: join(app.getPath('downloads'), filename),
      filters: [{ name: 'Tavern Born Character', extensions: ['tbc'] }],
    })
    if (canceled || !filePath) return false

    // Write beside the destination so a failed export cannot truncate a previous backup.
    const temporaryPath = join(dirname(filePath), `.tavern-born-${randomUUID()}.tmp`)
    const temporary = await open(temporaryPath, 'wx')
    try {
      try {
        await temporary.writeFile(text, 'utf8')
      } finally {
        await temporary.close()
      }
      await rename(temporaryPath, filePath)
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
    return true
  })

  ipcMain.on('fs:discardDataRoot', (event, root: unknown) => {
    if (isTrustedIpcSender(event) && root === pendingLocalDataRoot) {
      pendingLocalDataRoot = null
      localGrantGeneration += 1
    }
  })
  ipcMain.handle('fs:approveDataRoot', (event, root: unknown) => {
    assertTrustedIpcSender(event)
    return approveLocalDataRoot(root)
  })
  ipcMain.handle('resources:getBundledManifest', async (event) => {
    assertTrustedIpcSender(event)
    return (await getAllowedBundledManifest()).manifest
  })
  const catalogServices = new WeakMap<
    Electron.WebContents,
    ReturnType<typeof createCatalogService>
  >()
  ipcMain.on('catalog:message', (event, message: CatalogRequestMessage) => {
    if (!isTrustedIpcSender(event) || event.sender !== mainWindow?.webContents) return
    if (!message || typeof message.id !== 'string' || !/^[a-f0-9-]{36}$/.test(message.id)) return
    const owner = event.sender
    try {
      let service = catalogServices.get(owner)
      if (!service || service.closed) {
        if (message.kind !== 'run') return
        service = createCatalogService(
          owner,
          join(__dirname, 'catalogWorker.js'),
          async (request) => {
            if (request.kind === 'local') return readLocalJsonText(request.path, request.root)
            const { rootPath } = await getAllowedBundledManifest()
            return readBundledJsonText(join(rootPath, 'data'), request.path)
          },
          (root) => {
            checkLocalRoot(root)
            const generation = localGrantGeneration
            return () => {
              if (
                !localDataRoots.has(root) &&
                (root !== pendingLocalDataRoot || generation !== localGrantGeneration)
              )
                throw new Error('Select the data directory again.')
            }
          },
        )
        catalogServices.set(owner, service)
      }
      service.receive(message)
    } catch (error) {
      owner.send('catalog:event', {
        kind: 'error',
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
  app.on('web-contents-created', (_event, owner) => {
    const close = () => {
      catalogServices.get(owner)?.close()
      catalogServices.delete(owner)
    }
    owner.on('did-start-navigation', (event) => {
      if (event.isMainFrame && !event.isSameDocument) close()
    })
    owner.on('render-process-gone', close)
    owner.once('destroyed', close)
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
    void flushWindowStateWrites().finally(() => app.quit())
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

  contents.on('will-navigate', (event, url) => {
    const isTrustedMainRenderer =
      contents === mainWindow?.webContents &&
      isTrustedRendererUrl(
        url,
        RENDERER_ROOT_URL,
        isDev ? process.env.VITE_DEV_SERVER_URL : undefined,
      )
    if (!isTrustedMainRenderer) event.preventDefault()
  })

  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})
