import { contextBridge, ipcRenderer } from "electron";

// Expose a minimal, safe API to the renderer process via contextBridge.
// Only expose what the app actually needs — nothing more.
contextBridge.exposeInMainWorld("electronAPI", {
	platform: process.platform,
	versions: {
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node,
	},
	selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
	readLocalJson: (filePath: string) =>
		ipcRenderer.invoke("fs:readJson", filePath),
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
			readLocalJson: (filePath: string) => Promise<any>;
		};
	}
}
