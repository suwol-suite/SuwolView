import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { IPC_CHANNELS as SharedIpcChannels } from "../shared/ipc";
import type {
  AppError,
  AppLanguageSetting,
  AppResult,
  ChromePreferences,
  ImageMetadata,
  LocaleInfo,
  OpenLibraryResult,
  PanelPreferences,
  Preferences,
  RendererLogEntry,
  RuntimeInfo,
  SuwolApi,
  ThemeMode
} from "../shared/types";

const IPC_CHANNELS = {
  openFile: "suwol:open-file",
  openFolder: "suwol:open-folder",
  openRecent: "suwol:open-recent",
  openDroppedPaths: "suwol:open-dropped-paths",
  getLocaleInfo: "app:get-locale-info",
  getPreferences: "suwol:get-preferences",
  getLanguage: "settings:get-language",
  setLanguage: "settings:set-language",
  setTheme: "suwol:set-theme",
  updatePanelPreferences: "settings:update-panel-preferences",
  updateChromePreferences: "settings:update-chrome-preferences",
  toggleFullscreen: "app:toggleFullscreen",
  setFullscreen: "app:setFullscreen",
  getFullscreenState: "app:getFullscreenState",
  fullscreenChanged: "app:onFullscreenChanged",
  openSystemSettings: "app:open-system-settings",
  openReleases: "app:open-releases",
  copyExecutablePath: "app:copy-executable-path",
  getRuntimeInfo: "app:get-runtime-info",
  openLogsFolder: "app:open-logs-folder",
  resetSettings: "settings:reset",
  clearThumbnailCache: "cache:clear-thumbnails",
  restartInSafeMode: "app:restart-in-safe-mode",
  writeRendererLog: "app:write-renderer-log",
  rendererReady: "app:renderer-ready",
  openLibraryResult: "suwol:open-library-result",
  openError: "suwol:open-error",
  getMetadata: "suwol:get-metadata"
} as const satisfies typeof SharedIpcChannels;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppError(value: unknown): value is AppError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.messageKey === "string" &&
    (value.details === undefined || typeof value.details === "string")
  );
}

function parseAppError(message: string): AppError | undefined {
  const objectStart = message.indexOf("{");
  const objectEnd = message.lastIndexOf("}");
  if (objectStart < 0 || objectEnd <= objectStart) return undefined;

  try {
    const parsed = JSON.parse(message.slice(objectStart, objectEnd + 1)) as unknown;
    return isAppError(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeIpcError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    const parsed = parseAppError(error.message);
    if (parsed) return parsed;
    return {
      code: "IPC_ERROR",
      messageKey: "errors.actionFailed",
      details: error.message
    };
  }
  return {
    code: "IPC_ERROR",
    messageKey: "errors.actionFailed",
    details: String(error)
  };
}

function normalizeRendererLogEntry(entry: RendererLogEntry): RendererLogEntry {
  return {
    level: entry.level === "info" || entry.level === "warn" || entry.level === "error" ? entry.level : "error",
    message: String(entry.message).slice(0, 12_000),
    stack: typeof entry.stack === "string" ? entry.stack.slice(0, 12_000) : undefined,
    source: typeof entry.source === "string" ? entry.source.slice(0, 256) : undefined
  };
}

async function invokeIpc<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (error) {
    throw normalizeIpcError(error);
  }
}

const api: SuwolApi = {
  openFile: () => invokeIpc<OpenLibraryResult | null>(IPC_CHANNELS.openFile),
  openFolder: () => invokeIpc<OpenLibraryResult | null>(IPC_CHANNELS.openFolder),
  openRecent: (sourceId: string) => invokeIpc<OpenLibraryResult>(IPC_CHANNELS.openRecent, sourceId),
  openDroppedPaths: (paths: string[]) => invokeIpc<OpenLibraryResult>(IPC_CHANNELS.openDroppedPaths, paths),
  getLocaleInfo: () => invokeIpc<LocaleInfo>(IPC_CHANNELS.getLocaleInfo),
  getPreferences: () => invokeIpc<Preferences>(IPC_CHANNELS.getPreferences),
  getLanguage: () => invokeIpc<AppLanguageSetting>(IPC_CHANNELS.getLanguage),
  setLanguage: (language: AppLanguageSetting) => invokeIpc<Preferences>(IPC_CHANNELS.setLanguage, language),
  setTheme: (theme: ThemeMode) => invokeIpc<Preferences>(IPC_CHANNELS.setTheme, theme),
  updatePanelPreferences: (state: Partial<PanelPreferences>) => invokeIpc<Preferences>(IPC_CHANNELS.updatePanelPreferences, state),
  updateChromePreferences: (state: Partial<ChromePreferences>) => invokeIpc<Preferences>(IPC_CHANNELS.updateChromePreferences, state),
  toggleFullscreen: () => invokeIpc<boolean>(IPC_CHANNELS.toggleFullscreen),
  setFullscreen: (fullscreen: boolean) => invokeIpc<boolean>(IPC_CHANNELS.setFullscreen, fullscreen),
  getFullscreenState: () => invokeIpc<boolean>(IPC_CHANNELS.getFullscreenState),
  openSystemSettings: (target) => invokeIpc<void>(IPC_CHANNELS.openSystemSettings, target),
  openReleases: () => invokeIpc<void>(IPC_CHANNELS.openReleases),
  copyExecutablePath: () => invokeIpc<string>(IPC_CHANNELS.copyExecutablePath),
  getRuntimeInfo: () => invokeIpc<RuntimeInfo>(IPC_CHANNELS.getRuntimeInfo),
  openLogsFolder: () => invokeIpc<void>(IPC_CHANNELS.openLogsFolder),
  resetSettings: () => invokeIpc<Preferences>(IPC_CHANNELS.resetSettings),
  clearThumbnailCache: () => invokeIpc<void>(IPC_CHANNELS.clearThumbnailCache),
  restartInSafeMode: () => invokeIpc<void>(IPC_CHANNELS.restartInSafeMode),
  writeRendererLog: (entry: RendererLogEntry) =>
    invokeIpc<void>(IPC_CHANNELS.writeRendererLog, normalizeRendererLogEntry(entry)),
  rendererReady: () => invokeIpc<void>(IPC_CHANNELS.rendererReady),
  getMetadata: (itemId: string) => invokeIpc<AppResult<ImageMetadata>>(IPC_CHANNELS.getMetadata, itemId)
};

ipcRenderer.on(IPC_CHANNELS.openLibraryResult, (_event, payload: unknown) => {
  window.dispatchEvent(new CustomEvent("suwol:open-library-result", { detail: payload }));
});

ipcRenderer.on(IPC_CHANNELS.openError, (_event, payload: unknown) => {
  window.dispatchEvent(new CustomEvent("suwol:open-error", { detail: payload }));
});

ipcRenderer.on(IPC_CHANNELS.fullscreenChanged, (_event, payload: unknown) => {
  window.dispatchEvent(new CustomEvent("suwol:fullscreen-changed", { detail: payload }));
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("drop", (event) => {
  event.preventDefault();

  const files = Array.from(event.dataTransfer?.files ?? []);
  const paths = files
    .map((file) => webUtils.getPathForFile(file))
    .filter((filePath): filePath is string => typeof filePath === "string" && filePath.length > 0);

  window.dispatchEvent(
    new CustomEvent("suwol:dropped-paths", {
      detail: paths
    })
  );
});

contextBridge.exposeInMainWorld("suwol", api);
