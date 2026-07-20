import type { AppLanguageSetting, LocaleInfo } from "./i18n/types";

export type ThemeMode = "dark" | "light";
export type ChromeBarMode = "auto" | "always";
export type SourceKind = "folder" | "archive" | "file";
export type ArchiveBrowseMode = "continuous" | "folder";
export type SupportLevel = "native" | "converted" | "experimental" | "external";
export type ImageViewMode =
  | "original"
  | "fit-window"
  | "fit-width"
  | "fit-height"
  | "smart-two-page-left-to-right"
  | "smart-two-page-right-to-left"
  | "webtoon";
export type ViewMode = ImageViewMode;
export type ImageFilterPreset = "none" | "smooth" | "extra-smooth" | "sharp";
export type InterpolationFilter = "nearest" | "bilinear" | "bicubic" | "lanczos";
export type RuntimePlatform = "win32" | "darwin" | "linux" | (string & {});

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
  archive?: ArchiveImageLocation;
}

export interface ArchiveImageLocation {
  id: string;
  archiveEntryIndex: number;
  rawPath: string;
  normalizedPath: string;
  displayPath: string;
  fileName: string;
  parentPath: string;
  pathSegments: string[];
  extension: string;
  sizeBytes?: number;
}

export interface ArchiveFolderNode {
  id: string;
  name: string;
  fullPath: string;
  parentPath: string | null;
  childFolders: ArchiveFolderNode[];
  imageEntryIds: string[];
  descendantImageCount: number;
}

export interface ArchiveStructure {
  folders: ArchiveFolderNode[];
  commonRootPath?: string;
}

export interface OpenLibraryResult {
  source: LibrarySource;
  items: LibraryItem[];
  selectedIndex: number;
  recent: RecentSource[];
  archive?: ArchiveStructure;
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

export interface UpdatePreferences {
  checkForUpdatesOnStartup: boolean;
}

export interface ViewerPreferences {
  viewMode: ImageViewMode;
  upscaleSmallImages: boolean;
  interpolationFilter: InterpolationFilter;
  filterPreset: ImageFilterPreset;
  hdrEnabled: boolean;
  showZoomPercent: boolean;
  resetZoomOnImageChange: boolean;
}

export type UpdateStatus =
  | "idle"
  | "unsupported"
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "no-release"
  | "error";

export type UpdateCheckSource = "startup" | "manual";
export type UpdateCheckPhase =
  | "idle"
  | "starting"
  | "release-lookup"
  | "release-lookup-complete"
  | "native-check"
  | "complete"
  | "timeout"
  | "error";
export type ReleaseLookupStatus = "idle" | "checking" | "success" | "timeout" | "error";
export type NativeUpdaterStatus = "idle" | "waiting" | "checking" | "available" | "not-available" | "not-required" | "unsupported" | "timeout" | "error";
export type UpdateDownloadStatus = "idle" | "downloading" | "downloaded" | "timeout" | "error";
export type UpdateInstallStatus = "idle" | "ready" | "installing" | "error";

export type UpdateComparison = "up-to-date" | "update-available" | "ahead" | "no-release" | "error" | "disabled";

export interface UpdateReleaseInfo {
  latestTag?: string;
  title?: string;
  publishedAt?: string;
  body?: string;
  url?: string;
  assetNames: string[];
  hasPlatformUpdateMetadata: boolean;
  hasPlatformInstallerAsset: boolean;
  hasDmgAsset?: boolean;
  platformPackageAvailable?: boolean;
  manualDownloadUrl?: string;
}

export interface UpdateState {
  status: UpdateStatus;
  supported: boolean;
  updateAvailable: boolean;
  downloaded: boolean;
  version?: string;
  latestVersion?: string;
  releaseName?: string;
  comparison?: UpdateComparison;
  release?: UpdateReleaseInfo;
  lastCheckedAt?: string;
  autoUpdateSupported?: boolean;
  error?: AppError;
  progressPercent?: number;
  releaseLookupStatus?: ReleaseLookupStatus;
  nativeUpdaterStatus?: NativeUpdaterStatus;
  downloadStatus?: UpdateDownloadStatus;
  installStatus?: UpdateInstallStatus;
  platformPackageAvailable?: boolean;
  manualDownloadUrl?: string;
  requestId?: string;
  source?: UpdateCheckSource;
  phase?: UpdateCheckPhase;
  startedAt?: string;
  elapsedSeconds?: number;
  currentVersion?: string;
  messageKey?: string;
  errorCode?: string;
}

export interface UpdateCheckProgressEvent {
  requestId: string;
  source: UpdateCheckSource;
  phase: UpdateCheckPhase;
  messageKey: string;
  startedAt: string;
  timestamp: string;
  releaseStatus: ReleaseLookupStatus;
  nativeUpdaterStatus: NativeUpdaterStatus;
  status?: UpdateStatus;
  updateAvailable?: boolean;
  downloaded?: boolean;
  comparison?: UpdateComparison;
  latestVersion?: string;
  lastCheckedAt?: string;
  error?: AppError;
}

export interface Preferences extends PanelPreferences, ChromePreferences, UpdatePreferences, ViewerPreferences {
  theme: ThemeMode;
  language: AppLanguageSetting;
  recent: RecentSource[];
  lastLaunchVersion?: string;
  lastMacUpdateCleanupVersion?: string;
  lastMacUpdateCleanupResult?: "success" | "partial" | "failed" | "skipped";
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
  platform: RuntimePlatform;
  safeMode: boolean;
  isPackaged: boolean;
}

export interface LogFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt?: string;
}

export interface LogInfo {
  logDir: string;
  files: LogFileInfo[];
}

export interface CacheStats {
  thumbnailEntries: number;
  thumbnailSizeBytes: number;
  cacheSizeBytes: number;
}

export interface CacheMaintenanceResult {
  stats: CacheStats;
  removedEntries: number;
  removedBytes: number;
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
  updateUpdatePreferences: (state: Partial<UpdatePreferences>) => Promise<Preferences>;
  updateViewerPreferences: (state: Partial<ViewerPreferences>) => Promise<Preferences>;
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  getFullscreenState: () => Promise<boolean>;
  openSystemSettings: (target: "defaultApps") => Promise<AppResult<void>>;
  openReleases: () => Promise<void>;
  copyExecutablePath: () => Promise<string>;
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  openLogsFolder: () => Promise<void>;
  getLogInfo: () => Promise<LogInfo>;
  resetSettings: () => Promise<Preferences>;
  getCacheStats: () => Promise<CacheStats>;
  clearThumbnailCache: () => Promise<CacheMaintenanceResult>;
  cleanupThumbnailCache: () => Promise<CacheMaintenanceResult>;
  restartInSafeMode: () => Promise<void>;
  writeRendererLog: (entry: RendererLogEntry) => Promise<void>;
  rendererReady: () => Promise<void>;
  getMetadata: (itemId: string) => Promise<AppResult<ImageMetadata>>;
  getUpdateStatus: () => Promise<UpdateState>;
  checkForUpdates: (source?: UpdateCheckSource) => Promise<AppResult<UpdateState>>;
  onUpdateCheckProgress: (callback: (event: UpdateCheckProgressEvent) => void) => () => void;
  downloadUpdate: () => Promise<AppResult<UpdateState>>;
  installUpdate: () => Promise<AppResult<UpdateState>>;
}
