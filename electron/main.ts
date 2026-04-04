import { app, BrowserWindow, session, shell, ipcMain, dialog } from "electron";
import { dirname, join, normalize, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let hasUnsavedChanges = false;

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		webPreferences: {
			preload: join(__dirname, "preload.mjs"),
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
		title: "Tavern Born",
	});

	// Show window once content is ready to avoid white flash
	mainWindow.once("ready-to-show", () => {
		mainWindow?.show();
		if (isDev) {
			mainWindow?.webContents.openDevTools({ mode: "detach" });
		}
	});

	// --- Security: Restrict navigation ---
	// Only allow navigation to the app's own URLs
	mainWindow.webContents.on("will-navigate", (event, url) => {
		const allowedOrigins = ["http://localhost:", `file://${__dirname}`];
		const isAllowed = allowedOrigins.some((origin) => url.startsWith(origin));
		if (!isAllowed) {
			event.preventDefault();
		}
	});

	// --- Security: Open external links in the default browser ---
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https://") || url.startsWith("http://")) {
			shell.openExternal(url);
		}
		return { action: "deny" };
	});

	// Load the app
	if (process.env.VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(join(__dirname, "../dist/index.html"));
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	mainWindow.on("close", (event) => {
		if (!hasUnsavedChanges) {
			return;
		}

		const choice = dialog.showMessageBoxSync(mainWindow!, {
			type: "warning",
			title: "Unsaved changes",
			message: "You have unsaved changes.",
			detail:
				"Closing the app now will discard those changes. Are you sure you want to continue?",
			buttons: ["Cancel", "Discard Changes"],
			defaultId: 0,
			cancelId: 0,
		});

		if (choice === 0) {
			event.preventDefault();
		}
	});
}

// --- Security: Content Security Policy ---
app.on("ready", () => {
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [
					[
						"default-src 'self'",
						isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
						"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
						"font-src 'self' data: https://fonts.gstatic.com",
						"img-src 'self' data: blob: https:",
						isDev
							? "connect-src 'self' ws://localhost:* https:"
							: "connect-src 'self' https:",
						"worker-src 'self' blob:",
						"object-src 'none'",
						"base-uri 'self'",
						"form-action 'self'",
						"frame-ancestors 'none'",
					].join("; "),
				],
			},
		});
	});

	// --- Security: Deny all permission requests ---
	session.defaultSession.setPermissionRequestHandler(
		(_webContents, _permission, callback) => {
			callback(false);
		},
	);

	createWindow();

	ipcMain.handle("dialog:selectFolder", async () => {
		const result = await dialog.showOpenDialog(mainWindow!, {
			properties: ["openDirectory"],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	});
	ipcMain.handle("fs:readJson", async (_event, filePath: string) => {
		if (!isAbsolute(filePath)) throw new Error("Path must be absolute");
		const normalized = normalize(filePath);
		const content = await readFile(normalized, "utf-8");
		return JSON.parse(content);
	});
	ipcMain.on("state:setUnsavedChanges", (_event, value: boolean) => {
		hasUnsavedChanges = !!value;
	});
});

// macOS: Re-create window when dock icon is clicked
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// Quit when all windows are closed (except macOS)
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// --- Security: Prevent creation of additional WebContents ---
app.on("web-contents-created", (_event, contents) => {
	// Prevent navigation in any new webContents
	contents.on("will-navigate", (event) => {
		event.preventDefault();
	});

	// Deny all new window/tab creation from child contents
	contents.setWindowOpenHandler(() => ({ action: "deny" }));
});
