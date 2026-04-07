import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal, safe API to the renderer process via contextBridge.
// Only expose what the app actually needs — nothing more.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  readLocalJson: (filePath: string) =>
    ipcRenderer.invoke('fs:readJson', filePath),
  setUnsavedChanges: (value: boolean) =>
    ipcRenderer.send('state:setUnsavedChanges', value),
  /** Notify the main process of the active local data directory so it can
   *  enforce path-containment on `readLocalJson` calls. Call this on startup
   *  when restoring a previously-configured local data source config. */
  setLocalDataPath: (folderPath: string) =>
    ipcRenderer.send('config:setLocalDataPath', folderPath),
});

// Type declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      platform: string;
      versions: {
        electron: string;
        chrome: string;
        node: string;
      };
      selectFolder: () => Promise<string | null>;
      readLocalJson: (filePath: string) => Promise<unknown>;
      setUnsavedChanges?: (value: boolean) => void;
      setLocalDataPath: (folderPath: string) => void;
    };
  }
}
