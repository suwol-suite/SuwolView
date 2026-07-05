import type { AppLanguageSetting, LocaleInfo } from "./i18n/types";

export type ThemeMode = "dark" | "light";
export type ChromeBarMode = "auto" | "always";
export type SourceKind = "folder" | "archive" | "file";
export type SupportLevel = "native" | "converted" | "experimental" | "external";
export type ViewMode = "single" | "fit-window" | "fit-width" | "original" | "webtoon" | "comic-page";

export type { AppLanguageSetting, LocaleInfo };

export interface SupportInfo {
  extension: string;
  level: SupportLevel;
  label: string;
  mimeType: string;
}

export interface LibrarySource {
  id: string;
  kind: SourceKind;
  name: string;
  path: string;
  openedAt: string;
}

export type RecentSource = LibrarySource;

export interface LibraryItem {
  id: string;
  sourceId: string;
  sourceKind: SourceKind;
  name: string;
  extension: string;
  index: number;
  sizeBytes?: number;
  modifiedAt?: string;
  width?: number;
  height?: number;
  support: SupportInfo;
  displayUrl: string;
  thumbnailUrl: string;
  containerName?: string;
}

export interface OpenLibraryResult {
  source: LibrarySource;
  items: LibraryItem[];
  selectedIndex: number;
  recent: RecentSource[];
}

export type AppResult<T> = { ok: true; data: T } | ({ ok: false } & AppError);

export interface PanelPreferences {
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
}

export interface ChromePreferences {
  topBarMode: ChromeBarMode;
  bottomBarMode: ChromeBarMode;
}

export interface Preferences extends PanelPreferences, ChromePreferences {
  theme: ThemeMode;
  language: AppLanguageSetting;
  recent: RecentSource[];
}

export interface BasicMetadata {
  width?: number;
  height?: number;
  format?: string;
  space?: string;
  channels?: number;
  density?: number;
  orientation?: number;
  pages?: number;
  hasAlpha?: boolean;
}

export interface ImageMetadata {
  basic: BasicMetadata;
  exif: Record<string, string>;
  truncated?: boolean;
}

export interface AppError {
  code: string;
  messageKey: string;
  details?: string;
}

export interface RuntimeInfo {
  version: string;
  safeMode: boolean;
}

export interface RendererLogEntry {
  level?: "info" | "warn" | "error";
  message: string;
  stack?: string;
  source?: string;
}

export interface SuwolApi {
  openFile: () => Promise<OpenLibraryResult | null>;
  openFolder: () => Promise<OpenLibraryResult | null>;
  openRecent: (sourceId: string) => Promise<OpenLibraryResult>;
  openDroppedPaths: (paths: string[]) => Promise<OpenLibraryResult>;
  getLocaleInfo: () => Promise<LocaleInfo>;
  getPreferences: () => Promise<Preferences>;
  getLanguage: () => Promise<AppLanguageSetting>;
  setLanguage: (language: AppLanguageSetting) => Promise<Preferences>;
  setTheme: (theme: ThemeMode) => Promise<Preferences>;
  updatePanelPreferences: (state: Partial<PanelPreferences>) => Promise<Preferences>;
  updateChromePreferences: (state: Partial<ChromePreferences>) => Promise<Preferences>;
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  getFullscreenState: () => Promise<boolean>;
  openSystemSettings: (target: "defaultApps") => Promise<void>;
  openReleases: () => Promise<void>;
  copyExecutablePath: () => Promise<string>;
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  openLogsFolder: () => Promise<void>;
  resetSettings: () => Promise<Preferences>;
  clearThumbnailCache: () => Promise<void>;
  restartInSafeMode: () => Promise<void>;
  writeRendererLog: (entry: RendererLogEntry) => Promise<void>;
  rendererReady: () => Promise<void>;
  getMetadata: (itemId: string) => Promise<AppResult<ImageMetadata>>;
}
