import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, net, protocol, shell } from "electron";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { WINDOWS_RELEASES_URL } from "../shared/fileAssociations";
import { isAppLanguageSetting } from "../shared/i18n/languages";
import { resolveLanguageSetting, translateKey } from "../shared/i18n/lookup";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AppError,
  AppLanguageSetting,
  ChromePreferences,
  LocaleInfo,
  OpenLibraryResult,
  PanelPreferences,
  Preferences,
  ThemeMode,
  UpdatePreferences,
  ViewerPreferences
} from "../shared/types";
import { CachePaths } from "./cache";
import { DecoderLayer } from "./decoder";
import { resolveDropOpenTarget } from "./dropOpen";
import { LibraryManager, toFileUrl } from "./library";
import { AppLogger, logCrash, logMain, logRenderer, registerProcessErrorHandlers, setActiveLogger } from "./logging";
import { SettingsStore } from "./settings";
import { extractLaunchPathArguments } from "./startupOpen";
import { resolveDefaultAppsRequest } from "./systemSettings";
import { UpdateService } from "./updateService";
import { runMacUpdateCleanup } from "./updateCleanup";

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
let appRuntime:
  | { cache: CachePaths; logger: AppLogger; settings: SettingsStore; library: LibraryManager; updates: UpdateService }
  | undefined;
let rendererReady = false;
let pendingOpenProcessing = false;
let nextOpenRequestId = 0;
const pendingOpenRequests: Array<{ requestId: number; paths: string[] }> = [];
const safeMode = process.argv.includes("--safe-mode");

registerProcessErrorHandlers();

function launchArgvOptions() {
  return {
    isPackaged: app.isPackaged,
    appPath: app.isPackaged ? undefined : process.cwd(),
    execPath: process.execPath
  };
}

function relaunchArgsForSafeMode(): string[] {
  return app.isPackaged ? ["--safe-mode"] : [app.getAppPath(), "--safe-mode"];
}

function appIconPath(): string | undefined {
  const iconRoot = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), "assets");
  const candidates = process.platform === "win32"
    ? [path.join(iconRoot, "icon.ico"), path.join(iconRoot, "icon.png")]
    : [path.join(iconRoot, "icon.png"), path.join(iconRoot, "icon.ico")];
  return candidates.find((candidate) => existsSync(candidate));
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function sendFullscreenState(window: BrowserWindow): void {
  if (window.webContents.isDestroyed()) return;
  window.webContents.send(IPC_CHANNELS.fullscreenChanged, {
    fullscreen: window.isFullScreen()
  });
}

function windowFromSender(sender: Electron.WebContents): BrowserWindow {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window) {
    throw createIpcError("FULLSCREEN_FAILED", "errors.fullscreenFailed");
  }
  return window;
}

function createWindow(preferences: Preferences): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "SuwolView",
    icon: appIconPath(),
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
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`SuwolView load failed (${errorCode}): ${errorDescription} ${validatedUrl}`);
    logMain("Renderer load failed", { errorCode, errorDescription, validatedUrl }, "warn");
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`SuwolView renderer exited: ${details.reason}`);
    logCrash("Renderer process gone", { ...details });
  });
  window.webContents.on("console-message", (details) => {
    const consoleLevel = String(details.level).toLowerCase();
    console.log(
      `SuwolView renderer console[${details.level}] ${details.sourceId}:${details.lineNumber} ${details.message}`
    );
    if (consoleLevel === "warning" || consoleLevel === "warn" || consoleLevel === "error") {
      logRenderer({
        level: consoleLevel === "error" ? "error" : "warn",
        message: details.message,
        source: `${details.sourceId}:${details.lineNumber}`
      });
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = undefined;
      rendererReady = false;
    }
  });
  window.on("enter-full-screen", () => sendFullscreenState(window));
  window.on("leave-full-screen", () => sendFullscreenState(window));

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return window;
}

function translateForSettings(settings: SettingsStore, key: string): string {
  return translateKey(resolveLanguageSetting(settings.get().language, getLocaleInfo()), key);
}

function registerImageProtocol(library: LibraryManager, settings: SettingsStore): void {
  protocol.handle("suwol-image", async (request) => {
    try {
      const url = new URL(request.url);
      const kind = url.hostname;
      const itemId = decodeURIComponent(url.pathname.slice(1));

      if (!itemId || !library.hasCurrentItem(itemId)) {
        return new Response(translateForSettings(settings, "errors.imageNotFound"), { status: 404 });
      }

      const resolved =
        kind === "thumbnail"
          ? await library.resolveThumbnailFile(itemId)
          : kind === "display"
            ? await library.resolveDisplayFile(itemId)
            : undefined;

      if (!resolved) {
        return new Response(translateForSettings(settings, "errors.unknownImageRequest"), { status: 404 });
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
      return new Response(error instanceof Error ? error.message : translateForSettings(settings, "errors.unableToLoadImage"), {
        status: 500
      });
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

async function openAndRemember(
  library: LibraryManager,
  settings: SettingsStore,
  open: () => Promise<OpenLibraryResult>
): Promise<OpenLibraryResult> {
  const result = await open();
  const preferences = await settings.addRecent(result.source);
  return addRecentToResult(result, preferences);
}

function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

function createAppErrorPayload(code: string, messageKey: string, details?: string): AppError {
  return { code, messageKey, details };
}

function createIpcError(code: string, messageKey: string, details?: string): Error {
  const payload = createAppErrorPayload(code, messageKey, details);
  const error = new Error(JSON.stringify(payload));
  error.name = "SuwolViewError";
  return error;
}

function appErrorFromUnknown(error: unknown, fallbackCode: string, fallbackMessageKey: string): AppError {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as Partial<AppError>;
      if (typeof parsed.code === "string" && typeof parsed.messageKey === "string") {
        return {
          code: parsed.code,
          messageKey: parsed.messageKey,
          details: typeof parsed.details === "string" ? parsed.details : undefined
        };
      }
    } catch {
      // Fall through to the fallback payload.
    }
    return createAppErrorPayload(fallbackCode, fallbackMessageKey, error.message);
  }
  return createAppErrorPayload(fallbackCode, fallbackMessageKey, String(error));
}

async function openInputPaths(
  library: LibraryManager,
  settings: SettingsStore,
  inputPaths: readonly string[],
  options: {
    unsupportedCode: string;
    unsupportedMessageKey: string;
    failedCode: string;
    failedMessageKey: string;
  }
): Promise<OpenLibraryResult> {
  try {
    const target = await resolveDropOpenTarget(inputPaths);
    if (target.type === "folder") {
      return openAndRemember(library, settings, () => library.openFolder(target.path));
    }
    if (target.type === "image") {
      return openAndRemember(library, settings, () => library.openFile(target.path));
    }
    if (target.type === "images") {
      return openAndRemember(library, settings, () => library.openFiles(target.paths));
    }
    if (target.type === "archive") {
      return openAndRemember(library, settings, () => library.openArchive(target.path));
    }
    throw createIpcError(options.unsupportedCode, options.unsupportedMessageKey);
  } catch (error) {
    if (error instanceof Error && error.name === "SuwolViewError") {
      throw error;
    }
    throw createIpcError(options.failedCode, options.failedMessageKey, error instanceof Error ? error.message : String(error));
  }
}

function enqueueOpenPaths(paths: readonly string[]): void {
  const launchPaths = paths.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (launchPaths.length === 0) return;
  pendingOpenRequests.push({
    requestId: nextOpenRequestId + 1,
    paths: launchPaths
  });
  nextOpenRequestId += 1;
  focusMainWindow();
  void flushPendingOpenRequests();
}

async function flushPendingOpenRequests(): Promise<void> {
  if (pendingOpenProcessing || !appRuntime || !rendererReady || !mainWindow) return;
  pendingOpenProcessing = true;
  try {
    while (pendingOpenRequests.length > 0 && mainWindow && rendererReady) {
      const request = pendingOpenRequests.shift();
      if (!request) continue;
      try {
        const result = await openInputPaths(appRuntime.library, appRuntime.settings, request.paths, {
          unsupportedCode: "UNSUPPORTED_LAUNCH_ITEM",
          unsupportedMessageKey: "errors.unsupportedLaunchItem",
          failedCode: "OPEN_ARGUMENT_FAILED",
          failedMessageKey: "errors.openArgumentFailed"
        });
        mainWindow.webContents.send(IPC_CHANNELS.openLibraryResult, { requestId: request.requestId, result });
      } catch (error) {
        mainWindow.webContents.send(IPC_CHANNELS.openError, {
          requestId: request.requestId,
          error: appErrorFromUnknown(error, "OPEN_ARGUMENT_FAILED", "errors.openArgumentFailed")
        });
      }
    }
  } finally {
    pendingOpenProcessing = false;
  }
}

function getLocaleInfo(): LocaleInfo {
  const locale = app.getLocale();
  const preferredSystemLanguages = app.getPreferredSystemLanguages();
  return {
    locale,
    preferredSystemLanguages: preferredSystemLanguages.length > 0 ? preferredSystemLanguages : [locale].filter(Boolean)
  };
}

function registerIpcHandlers(settings: SettingsStore, library: LibraryManager, updates: UpdateService): void {
  ipcMain.handle(IPC_CHANNELS.openFolder, async () => {
    const selection = await showOpenDialog({
      title: translateForSettings(settings, "toolbar.openFolder"),
      properties: ["openDirectory"]
    });
    if (selection.canceled || selection.filePaths.length === 0) return null;

    return openAndRemember(library, settings, () => library.openFolder(selection.filePaths[0]));
  });

  ipcMain.handle(IPC_CHANNELS.openFile, async () => {
    const selection = await showOpenDialog({
      title: translateForSettings(settings, "toolbar.openFile"),
      properties: ["openFile"],
      filters: [
        {
          name: translateForSettings(settings, "formats.supportedFiles"),
          extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "ico", "svg", "tif", "tiff", "zip", "cbz"]
        }
      ]
    });
    if (selection.canceled || selection.filePaths.length === 0) return null;

    return openAndRemember(library, settings, () => library.openFile(selection.filePaths[0]));
  });

  ipcMain.handle(IPC_CHANNELS.openRecent, async (_event, sourceId: string) => {
    const recent = settings.findRecent(sourceId);
    if (!recent) {
      throw createIpcError("RECENT_SOURCE_NOT_FOUND", "errors.recentSourceNotFound");
    }
    return openAndRemember(library, settings, () => library.openPath(recent));
  });

  ipcMain.handle(IPC_CHANNELS.openDroppedPaths, async (_event, paths: unknown) => {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw createIpcError("DROP_UNSUPPORTED", "errors.dropUnsupported");
    }
    return openInputPaths(library, settings, paths.filter((entry): entry is string => typeof entry === "string"), {
      unsupportedCode: "DROP_UNSUPPORTED",
      unsupportedMessageKey: "errors.dropUnsupported",
      failedCode: "DROP_OPEN_FAILED",
      failedMessageKey: "errors.dropOpenFailed"
    });
  });

  ipcMain.handle(IPC_CHANNELS.getLocaleInfo, () => getLocaleInfo());

  ipcMain.handle(IPC_CHANNELS.getPreferences, () => settings.get());

  ipcMain.handle(IPC_CHANNELS.getLanguage, () => settings.get().language);

  ipcMain.handle(IPC_CHANNELS.setLanguage, async (_event, language: AppLanguageSetting) => {
    if (!isAppLanguageSetting(language)) {
      throw createIpcError("INVALID_LANGUAGE", "errors.invalidLanguage");
    }
    return settings.setLanguage(language);
  });

  ipcMain.handle(IPC_CHANNELS.setTheme, async (_event, theme: ThemeMode) => {
    if (theme !== "dark" && theme !== "light") {
      throw createIpcError("INVALID_THEME", "errors.invalidTheme");
    }
    nativeTheme.themeSource = theme;
    return settings.setTheme(theme);
  });

  ipcMain.handle(IPC_CHANNELS.updatePanelPreferences, async (_event, state: Partial<PanelPreferences>) => {
    return settings.updatePanelPreferences(state);
  });

  ipcMain.handle(IPC_CHANNELS.updateChromePreferences, async (_event, state: Partial<ChromePreferences>) => {
    return settings.updateChromePreferences(state);
  });

  ipcMain.handle(IPC_CHANNELS.updateViewerPreferences, async (_event, state: Partial<ViewerPreferences>) => {
    return settings.updateViewerPreferences(state);
  });

  ipcMain.handle(IPC_CHANNELS.updateUpdatePreferences, async (_event, state: Partial<UpdatePreferences>) => {
    const preferences = await settings.updateUpdatePreferences(state);
    updates.setPreferences({
      checkForUpdatesOnStartup: preferences.checkForUpdatesOnStartup
    });
    return preferences;
  });

  ipcMain.handle(IPC_CHANNELS.toggleFullscreen, (event) => {
    const window = windowFromSender(event.sender);
    const nextFullscreen = !window.isFullScreen();
    window.setFullScreen(nextFullscreen);
    return nextFullscreen;
  });

  ipcMain.handle(IPC_CHANNELS.setFullscreen, (event, fullscreen: unknown) => {
    const window = windowFromSender(event.sender);
    const nextFullscreen = fullscreen === true;
    window.setFullScreen(nextFullscreen);
    return nextFullscreen;
  });

  ipcMain.handle(IPC_CHANNELS.getFullscreenState, (event) => {
    return windowFromSender(event.sender).isFullScreen();
  });

  ipcMain.handle(IPC_CHANNELS.openSystemSettings, async (_event, target: unknown) => {
    const request = resolveDefaultAppsRequest(process.platform, target);
    if (!request.ok) return request;
    await shell.openExternal("ms-settings:defaultapps");
    return request;
  });

  ipcMain.handle(IPC_CHANNELS.openReleases, async () => {
    await shell.openExternal(WINDOWS_RELEASES_URL);
  });

  ipcMain.handle(IPC_CHANNELS.copyExecutablePath, () => {
    const executablePath = app.getPath("exe");
    clipboard.writeText(executablePath);
    return executablePath;
  });

  ipcMain.handle(IPC_CHANNELS.getRuntimeInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    safeMode,
    isPackaged: app.isPackaged
  }));

  ipcMain.handle(IPC_CHANNELS.openLogsFolder, async () => {
    if (!appRuntime) {
      throw createIpcError("LOGS_OPEN_FAILED", "errors.logsOpenFailed");
    }
    await appRuntime.logger.ensure();
    const result = await shell.openPath(appRuntime.logger.logDir);
    if (result) {
      throw createIpcError("LOGS_OPEN_FAILED", "errors.logsOpenFailed", result);
    }
  });

  ipcMain.handle(IPC_CHANNELS.getLogInfo, async () => {
    if (!appRuntime) {
      throw createIpcError("LOG_INFO_FAILED", "errors.logsOpenFailed");
    }
    return appRuntime.logger.info();
  });

  ipcMain.handle(IPC_CHANNELS.resetSettings, async () => {
    const preferences = await settings.reset();
    nativeTheme.themeSource = preferences.theme;
    logMain("Settings reset from renderer request");
    return preferences;
  });

  ipcMain.handle(IPC_CHANNELS.getCacheStats, async () => {
    if (!appRuntime) {
      throw createIpcError("CACHE_STATS_FAILED", "errors.cacheStatsFailed");
    }
    return appRuntime.cache.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.clearThumbnailCache, async () => {
    if (!appRuntime) {
      throw createIpcError("CACHE_CLEAR_FAILED", "errors.cacheClearFailed");
    }
    const result = await appRuntime.cache.clearThumbnailCache();
    library.clearMetadataFailureCache();
    logMain("Thumbnail and metadata failure caches cleared from renderer request", {
      removedEntries: result.removedEntries,
      removedBytes: result.removedBytes
    });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.cleanupThumbnailCache, async () => {
    if (!appRuntime) {
      throw createIpcError("CACHE_CLEANUP_FAILED", "errors.cacheCleanupFailed");
    }
    const result = await appRuntime.cache.cleanupThumbnails();
    logMain("Old thumbnail cache entries cleaned from renderer request", {
      removedEntries: result.removedEntries,
      removedBytes: result.removedBytes
    });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.restartInSafeMode, () => {
    logMain("Restart in safe mode requested");
    app.relaunch({ args: relaunchArgsForSafeMode() });
    app.exit(0);
  });

  ipcMain.handle(IPC_CHANNELS.writeRendererLog, (_event, payload: unknown) => {
    if (payload && typeof payload === "object" && "message" in payload) {
      const entry = payload as { level?: unknown; message?: unknown; stack?: unknown; source?: unknown };
      if (typeof entry.message !== "string") return;
      logRenderer({
        level: entry.level === "info" || entry.level === "warn" || entry.level === "error" ? entry.level : "error",
        message: entry.message,
        stack: typeof entry.stack === "string" ? entry.stack : undefined,
        source: typeof entry.source === "string" ? entry.source : undefined
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.rendererReady, () => {
    rendererReady = true;
    void flushPendingOpenRequests();
  });

  ipcMain.handle(IPC_CHANNELS.getMetadata, async (_event, itemId: string) => {
    try {
      return await library.readMetadata(itemId);
    } catch (error) {
      return {
        ok: false,
        ...createAppErrorPayload(
          "METADATA_FAILED",
          "errors.metadataFailed",
          error instanceof Error ? error.message : String(error)
        )
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.getUpdateStatus, () => updates.getStatus());

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, () => updates.checkForUpdates());

  ipcMain.handle(IPC_CHANNELS.downloadUpdate, () => updates.downloadUpdate());

  ipcMain.handle(IPC_CHANNELS.installUpdate, () => updates.installUpdate());
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
  const requiredFiles = ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md", "README.md"];
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

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  if (!safeMode) {
    enqueueOpenPaths(extractLaunchPathArguments(process.argv, launchArgvOptions()));
  }

  app.on("second-instance", (_event, argv) => {
    focusMainWindow();
    if (!safeMode) {
      enqueueOpenPaths(extractLaunchPathArguments(argv, launchArgvOptions()));
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (!safeMode) {
      enqueueOpenPaths([filePath]);
    }
  });
}

app.on("child-process-gone", (_event, details) => {
  logCrash("Child process gone", { ...details });
});

if (hasSingleInstanceLock) void app.whenReady().then(async () => {
  const cache = new CachePaths(app.getPath("userData"));
  await cache.ensure();

  const logger = new AppLogger(app.getPath("userData"));
  await logger.ensure();
  setActiveLogger(logger);
  logMain("SuwolView starting", { version: app.getVersion(), safeMode, packaged: app.isPackaged });

  const settings = new SettingsStore(app.getPath("userData"));
  const preferences = await settings.load({ safeMode });
  await runMacUpdateCleanup({
    platform: process.platform,
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    executablePath: app.getPath("exe"),
    bundleIdentifier: "org.suwolview.app",
    appName: app.getName(),
    userDataPath: app.getPath("userData"),
    settings
  });
  nativeTheme.themeSource = preferences.theme;

  const decoder = new DecoderLayer(cache, { safeMode });
  const library = new LibraryManager(decoder);
  const updates = new UpdateService(
    {
      isPackaged: app.isPackaged,
      safeMode,
      platform: process.platform,
      appImagePath: process.env.APPIMAGE,
      version: app.getVersion()
    },
    {
      checkForUpdatesOnStartup: preferences.checkForUpdatesOnStartup
    }
  );
  appRuntime = { cache, logger, settings, library, updates };

  registerImageProtocol(library, settings);
  registerIpcHandlers(settings, library, updates);

  await ensureLegalFilesPresent();
  mainWindow = createWindow(preferences);
  void updates.checkOnStartup();

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
