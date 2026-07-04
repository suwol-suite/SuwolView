export type ThemeMode = "dark" | "light";
export type SourceKind = "folder" | "archive" | "file";
export type SupportLevel = "native" | "converted" | "experimental" | "external";
export type ViewMode = "single" | "fit-window" | "fit-width" | "original" | "webtoon" | "comic-page";

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

export interface Preferences {
  theme: ThemeMode;
  showThumbnails: boolean;
  showInfo: boolean;
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
}

export interface AppError {
  message: string;
}

export interface SuwolApi {
  openFile: () => Promise<OpenLibraryResult | null>;
  openFolder: () => Promise<OpenLibraryResult | null>;
  openRecent: (sourceId: string) => Promise<OpenLibraryResult>;
  getPreferences: () => Promise<Preferences>;
  setTheme: (theme: ThemeMode) => Promise<Preferences>;
  setPanelState: (state: Pick<Preferences, "showThumbnails" | "showInfo">) => Promise<Preferences>;
  getMetadata: (itemId: string) => Promise<ImageMetadata>;
}
