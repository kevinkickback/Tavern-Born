import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'

function onIpcEvent(channel: string, callback: () => void): () => void {
  const listener = () => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

function onIpcPayload<T>(channel: string, callback: (data: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, data: T) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  readLocalJson: (filePath: string) => ipcRenderer.invoke('fs:readJson', filePath),
  setUnsavedChanges: (value: boolean) => ipcRenderer.send('state:setUnsavedChanges', value),
  setLocalDataPath: (folderPath: string) => ipcRenderer.send('config:setLocalDataPath', folderPath),
  onConfirmClose: (callback: () => void) => {
    ipcRenderer.on('app:confirmClose', callback)
  },
  removeConfirmCloseListener: (callback: () => void) => {
    ipcRenderer.removeListener('app:confirmClose', callback)
  },
  forceClose: () => ipcRenderer.send('app:forceClose'),
  setTitleBarOverlay: (color: string, symbolColor: string, height: number) =>
    ipcRenderer.send('window:set-title-bar-overlay', { color, symbolColor, height }),

  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  cancelUpdate: () => ipcRenderer.invoke('update:cancel'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  setAutoCheck: (enabled: boolean) => ipcRenderer.invoke('update:set-auto-check', enabled),
  getAppVersion: () => ipcRenderer.invoke('update:get-version'),
  getCurrentChangelog: () =>
    ipcRenderer.invoke('update:get-current-changelog') as Promise<{
      version: string
      changelog: string | null
    }>,

  onUpdateChecking: (callback: () => void) => onIpcEvent('update-checking', callback),
  onUpdateAvailable: (
    callback: (data: { version: string; changelog: string | null; isPortable: boolean }) => void,
  ) => onIpcPayload('update-available', callback),
  onUpdateNotAvailable: (callback: () => void) => onIpcEvent('update-not-available', callback),
  onUpdateError: (callback: (data: { message: string }) => void) =>
    onIpcPayload('update-error', callback),
  onDownloadProgress: (
    callback: (data: {
      percentage: number
      bytesPerSecond: number
      total: number
      transferred: number
    }) => void,
  ) => onIpcPayload('download-progress', callback),
  onUpdateDownloaded: (callback: (data: { version: string }) => void) =>
    onIpcPayload('update-downloaded', callback),
  onUpdateCancelled: (callback: () => void) => onIpcEvent('update-cancelled', callback),
})

declare global {
  interface Window {
    electronAPI: {
      platform: string
      versions: {
        electron: string
        chrome: string
        node: string
      }
      selectFolder: () => Promise<string | null>
      readLocalJson: (filePath: string) => Promise<unknown>
      setUnsavedChanges?: (value: boolean) => void
      setLocalDataPath: (folderPath: string) => void
      onConfirmClose: (callback: () => void) => void
      removeConfirmCloseListener: (callback: () => void) => void
      forceClose: () => void
      setTitleBarOverlay: (color: string, symbolColor: string, height: number) => void
      // Update methods
      checkForUpdate: () => Promise<{ success: boolean; data: unknown; error: string | null }>
      downloadUpdate: () => Promise<{ success: boolean; data: null; error: string | null }>
      cancelUpdate: () => Promise<{ success: boolean; data: null; error: string | null }>
      installUpdate: () => Promise<void>
      getUpdateStatus: () => Promise<unknown>
      setAutoCheck: (enabled: boolean) => Promise<void>
      getAppVersion: () => Promise<string>
      getCurrentChangelog: () => Promise<{ version: string; changelog: string | null }>
      onUpdateChecking: (callback: () => void) => () => void
      onUpdateAvailable: (
        callback: (data: {
          version: string
          changelog: string | null
          isPortable: boolean
        }) => void,
      ) => () => void
      onUpdateNotAvailable: (callback: () => void) => () => void
      onUpdateError: (callback: (data: { message: string }) => void) => () => void
      onDownloadProgress: (
        callback: (data: {
          percentage: number
          bytesPerSecond: number
          total: number
          transferred: number
        }) => void,
      ) => () => void
      onUpdateDownloaded: (callback: (data: { version: string }) => void) => () => void
      onUpdateCancelled: (callback: () => void) => () => void
    }
  }
}
