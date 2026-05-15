import { contextBridge, ipcRenderer } from 'electron'

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

  onUpdateChecking: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('update-checking', listener)
    return () => ipcRenderer.removeListener('update-checking', listener)
  },
  onUpdateAvailable: (
    callback: (data: { version: string; changelog: string | null; isPortable: boolean }) => void,
  ) => {
    const listener = (
      _event: unknown,
      data: { version: string; changelog: string | null; isPortable: boolean },
    ) => callback(data)
    ipcRenderer.on('update-available', listener as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('update-available', listener as (...args: unknown[]) => void)
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('update-not-available', listener)
    return () => ipcRenderer.removeListener('update-not-available', listener)
  },
  onUpdateError: (callback: (data: { message: string }) => void) => {
    const listener = (_event: unknown, data: { message: string }) => callback(data)
    ipcRenderer.on('update-error', listener as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('update-error', listener as (...args: unknown[]) => void)
  },
  onDownloadProgress: (
    callback: (data: {
      percentage: number
      bytesPerSecond: number
      total: number
      transferred: number
    }) => void,
  ) => {
    const listener = (
      _event: unknown,
      data: { percentage: number; bytesPerSecond: number; total: number; transferred: number },
    ) => callback(data)
    ipcRenderer.on('download-progress', listener as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('download-progress', listener as (...args: unknown[]) => void)
  },
  onUpdateDownloaded: (callback: (data: { version: string }) => void) => {
    const listener = (_event: unknown, data: { version: string }) => callback(data)
    ipcRenderer.on('update-downloaded', listener as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('update-downloaded', listener as (...args: unknown[]) => void)
  },
  onUpdateCancelled: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('update-cancelled', listener)
    return () => ipcRenderer.removeListener('update-cancelled', listener)
  },
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
