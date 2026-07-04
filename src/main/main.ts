import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol } from "electron";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { access } from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import type { Preferences, ThemeMode } from "../shared/types";
import { CachePaths } from "./cache";
import { DecoderLayer } from "./decoder";
import { LibraryManager, toFileUrl } from "./library";
import { SettingsStore } from "./settings";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "suwol-image",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | undefined;

function createWindow(preferences: Preferences): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "SuwolView",
    backgroundColor: preferences.theme === "dark" ? "#101418" : "#f6f8f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  window.removeMenu();

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return window;
}

function registerImageProtocol(library: LibraryManager): void {
  protocol.handle("suwol-image", async (request) => {
    try {
      const url = new URL(request.url);
      const kind = url.hostname;
      const itemId = decodeURIComponent(url.pathname.slice(1));

      if (!itemId || !library.hasCurrentItem(itemId)) {
        return new Response("Image not found.", { status: 404 });
      }

      const resolved =
        kind === "thumbnail"
          ? await library.resolveThumbnailFile(itemId)
          : kind === "display"
            ? await library.resolveDisplayFile(itemId)
            : undefined;

      if (!resolved) {
        return new Response("Unknown image request.", { status: 404 });
      }

      const response = await net.fetch(toFileUrl(resolved.path));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "content-type": resolved.mimeType,
          "cache-control": "private, max-age=31536000, immutable"
        }
      });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Unable to load image.", { status: 500 });
    }
  });
}

function addRecentToResult<T extends { source: { id: string }; recent: unknown[] }>(
  result: T,
  preferences: Preferences
): T {
  return {
    ...result,
    recent: preferences.recent
  };
}

function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

function registerIpcHandlers(settings: SettingsStore, library: LibraryManager): void {
  ipcMain.handle(IPC_CHANNELS.openFolder, async () => {
    const selection = await showOpenDialog({
      title: "Open Folder",
      properties: ["openDirectory"]
    });
    if (selection.canceled || selection.filePaths.length === 0) return null;

    const result = await library.openFolder(selection.filePaths[0]);
    const preferences = await settings.addRecent(result.source);
    return addRecentToResult(result, preferences);
  });

  ipcMain.handle(IPC_CHANNELS.openFile, async () => {
    const selection = await showOpenDialog({
      title: "Open File",
      properties: ["openFile"],
      filters: [
        {
          name: "SuwolView supported files",
          extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "ico", "svg", "tif", "tiff", "zip", "cbz"]
        }
      ]
    });
    if (selection.canceled || selection.filePaths.length === 0) return null;

    const result = await library.openFile(selection.filePaths[0]);
    const preferences = await settings.addRecent(result.source);
    return addRecentToResult(result, preferences);
  });

  ipcMain.handle(IPC_CHANNELS.openRecent, async (_event, sourceId: string) => {
    const recent = settings.findRecent(sourceId);
    if (!recent) {
      throw new Error("Recent source not found.");
    }
    const result = await library.openPath(recent);
    const preferences = await settings.addRecent(result.source);
    return addRecentToResult(result, preferences);
  });

  ipcMain.handle(IPC_CHANNELS.getPreferences, () => settings.get());

  ipcMain.handle(IPC_CHANNELS.setTheme, async (_event, theme: ThemeMode) => {
    if (theme !== "dark" && theme !== "light") {
      throw new Error("Invalid theme.");
    }
    nativeTheme.themeSource = theme;
    return settings.setTheme(theme);
  });

  ipcMain.handle(IPC_CHANNELS.setPanelState, async (_event, state: Pick<Preferences, "showThumbnails" | "showInfo">) => {
    return settings.setPanelState(Boolean(state.showThumbnails), Boolean(state.showInfo));
  });

  ipcMain.handle(IPC_CHANNELS.getMetadata, async (_event, itemId: string) => {
    return library.readMetadata(itemId);
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureLegalFilesPresent(): Promise<void> {
  const searchRoots = [app.getAppPath(), process.resourcesPath, path.dirname(app.getPath("exe"))];
  const requiredFiles = ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md"];
  const missingFiles: string[] = [];

  for (const fileName of requiredFiles) {
    const foundInRoots = await Promise.all(searchRoots.map((rootPath) => fileExists(path.join(rootPath, fileName))));
    const found = foundInRoots.some(Boolean);
    if (!found) {
      missingFiles.push(fileName);
    }
  }

  if (missingFiles.length > 0) {
    console.warn(`SuwolView package notice: missing legal files: ${missingFiles.join(", ")}`);
  }
}

void app.whenReady().then(async () => {
  const cache = new CachePaths(app.getPath("userData"));
  await cache.ensure();

  const settings = new SettingsStore(app.getPath("userData"));
  const preferences = await settings.load();
  nativeTheme.themeSource = preferences.theme;

  const decoder = new DecoderLayer(cache);
  const library = new LibraryManager(decoder);

  registerImageProtocol(library);
  registerIpcHandlers(settings, library);

  await ensureLegalFilesPresent();
  mainWindow = createWindow(preferences);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(settings.get());
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
