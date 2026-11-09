import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import type { CatalogRequestMessage, CatalogWorkerMessage } from '@/lib/5etools/catalogProtocol'
import type { BundledSrdManifestSummary } from './bundledResources'
import type { UpdateEventPayloads, UpdateSignal } from './updateEvents'

function onIpcEvent(channel: 'app:confirmClose' | UpdateSignal, callback: () => void): () => void {
  const listener = () => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

function subscribeToUpdate<Channel extends keyof UpdateEventPayloads>(channel: Channel) {
  return (callback: (data: UpdateEventPayloads[Channel]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: UpdateEventPayloads[Channel]) =>
      callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

interface UpdateResult<Data = null> {
  success: boolean
  data: Data
  error: string | null
}

const electronAPI = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),
  discardLocalDataRoot: (root: string): void => ipcRenderer.send('fs:discardDataRoot', root),
  approveLocalDataRoot: (root: string): Promise<void> =>
    ipcRenderer.invoke('fs:approveDataRoot', root),
  readLocalJson: (filePath: string, root?: string): Promise<unknown> =>
    ipcRenderer.invoke('fs:readJson', filePath, root),
  readBundledJson: (relativePath: string): Promise<unknown> =>
    ipcRenderer.invoke('resources:readBundledJson', relativePath),
  getBundledManifest: (): Promise<BundledSrdManifestSummary> =>
    ipcRenderer.invoke('resources:getBundledManifest'),
  sendCatalogMessage: (message: CatalogRequestMessage): void =>
    ipcRenderer.send('catalog:message', message),
  onCatalogMessage: (callback: (message: CatalogWorkerMessage) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, message: CatalogWorkerMessage) => callback(message)
    ipcRenderer.on('catalog:event', listener)
    return () => ipcRenderer.removeListener('catalog:event', listener)
  },
  setUnsavedChanges: (value: boolean) => ipcRenderer.send('state:setUnsavedChanges', value),
  onConfirmClose: (callback: () => void) => onIpcEvent('app:confirmClose', callback),
  forceClose: () => ipcRenderer.send('app:forceClose'),
  setTitleBarOverlay: (color: string, symbolColor: string, height: number) =>
    ipcRenderer.send('window:set-title-bar-overlay', { color, symbolColor, height }),

  checkForUpdate: (): Promise<UpdateResult<unknown>> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<UpdateResult> => ipcRenderer.invoke('update:download'),
  openPortableUpdatePage: (): Promise<UpdateResult> =>
    ipcRenderer.invoke('update:open-portable-page'),
  cancelUpdate: (): Promise<UpdateResult> => ipcRenderer.invoke('update:cancel'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  getUpdateStatus: (): Promise<unknown> => ipcRenderer.invoke('update:status'),
  setAutoCheck: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('update:set-auto-check', enabled),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('update:get-version'),
  getCurrentChangelog: (): Promise<{ version: string; changelog: string | null }> =>
    ipcRenderer.invoke('update:get-current-changelog'),

  onUpdateChecking: (callback: () => void) => onIpcEvent('update-checking', callback),
  onUpdateAvailable: subscribeToUpdate('update-available'),
  onUpdateNotAvailable: (callback: () => void) => onIpcEvent('update-not-available', callback),
  onUpdateError: subscribeToUpdate('update-error'),
  onDownloadProgress: subscribeToUpdate('download-progress'),
  onUpdateDownloaded: subscribeToUpdate('update-downloaded'),
  onUpdateCancelled: (callback: () => void) => onIpcEvent('update-cancelled', callback),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
