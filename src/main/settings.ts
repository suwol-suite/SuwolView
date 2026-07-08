import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeChromePreferences } from "../shared/chromePreferences";
import { normalizeLanguagePreference } from "../shared/i18n/languages";
import { normalizePanelPreferences } from "../shared/panelPreferences";
import { normalizeViewerPreferences } from "../shared/viewerPreferences";
import type {
  AppLanguageSetting,
  ChromePreferences,
  LibrarySource,
  PanelPreferences,
  Preferences,
  RecentSource,
  ThemeMode,
  UpdatePreferences,
  ViewerPreferences
} from "../shared/types";
import { logMain } from "./logging";

const MAX_RECENT = 12;

export function defaultPreferences(): Preferences {
  return {
    theme: "dark",
    language: "system",
    checkForUpdatesOnStartup: false,
    ...normalizeChromePreferences(),
    ...normalizePanelPreferences(),
    ...normalizeViewerPreferences(),
    recent: []
  };
}

export function safeModePreferences(): Preferences {
  return {
    ...defaultPreferences(),
    leftPanelVisible: false,
    rightPanelVisible: false,
    topBarMode: "auto",
    recent: []
  };
}

function legacyBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeThemePreference(value: unknown): ThemeMode {
  return value === "dark" || value === "light" ? value : defaultPreferences().theme;
}

function normalizeUpdatePreferences(input: Partial<UpdatePreferences> = {}): UpdatePreferences {
  return {
    checkForUpdatesOnStartup:
      typeof input.checkForUpdatesOnStartup === "boolean"
        ? input.checkForUpdatesOnStartup
        : defaultPreferences().checkForUpdatesOnStartup
  };
}

export class SettingsStore {
  private preferences = defaultPreferences();
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "settings.json");
  }

  async load(options: { safeMode?: boolean } = {}): Promise<Preferences> {
    if (options.safeMode) {
      this.preferences = safeModePreferences();
      logMain("Settings loaded in safe mode with default preferences");
      return this.get();
    }

    try {
      const rawData = await readFile(this.settingsPath, "utf8");
      const data = JSON.parse(rawData) as Partial<Preferences>;
      this.preferences = {
        ...defaultPreferences(),
        ...data,
        theme: normalizeThemePreference(data.theme),
        language: normalizeLanguagePreference(data.language),
        ...normalizeUpdatePreferences({
          checkForUpdatesOnStartup: data.checkForUpdatesOnStartup
        }),
        ...normalizeChromePreferences({
          topBarMode: data.topBarMode,
          bottomBarMode: data.bottomBarMode
        }),
        ...normalizePanelPreferences({
          leftPanelVisible: data.leftPanelVisible ?? legacyBoolean((data as { showThumbnails?: unknown }).showThumbnails),
          rightPanelVisible: data.rightPanelVisible ?? legacyBoolean((data as { showInfo?: unknown }).showInfo),
          leftPanelWidth: data.leftPanelWidth,
          rightPanelWidth: data.rightPanelWidth
        }),
        ...normalizeViewerPreferences({
          viewMode: data.viewMode,
          upscaleSmallImages: data.upscaleSmallImages,
          interpolationFilter: data.interpolationFilter,
          filterPreset: data.filterPreset,
          hdrEnabled: data.hdrEnabled,
          showZoomPercent: data.showZoomPercent,
          resetZoomOnImageChange: data.resetZoomOnImageChange
        }),
        recent: Array.isArray(data.recent) ? data.recent.slice(0, MAX_RECENT) : []
      };
    } catch (error) {
      this.preferences = defaultPreferences();
      if (!isMissingFileError(error)) {
        const backupPath = await this.backupCorruptSettings();
        logMain("Corrupt settings recovered with defaults", {
          backupPath,
          error: error instanceof Error ? error.message : String(error)
        }, "warn");
      }
      await this.save();
    }
    return this.get();
  }

  get(): Preferences {
    return {
      ...this.preferences,
      recent: [...this.preferences.recent]
    };
  }

  async setTheme(theme: ThemeMode): Promise<Preferences> {
    this.preferences.theme = theme;
    await this.save();
    return this.get();
  }

  async setLanguage(language: AppLanguageSetting): Promise<Preferences> {
    this.preferences.language = normalizeLanguagePreference(language);
    await this.save();
    return this.get();
  }

  async updatePanelPreferences(panelPreferences: Partial<PanelPreferences>): Promise<Preferences> {
    this.preferences = {
      ...this.preferences,
      ...normalizePanelPreferences({
        ...this.preferences,
        ...panelPreferences
      })
    };
    await this.save();
    return this.get();
  }

  async updateChromePreferences(chromePreferences: Partial<ChromePreferences>): Promise<Preferences> {
    this.preferences = {
      ...this.preferences,
      ...normalizeChromePreferences({
        ...this.preferences,
        ...chromePreferences
      })
    };
    await this.save();
    return this.get();
  }

  async updateUpdatePreferences(updatePreferences: Partial<UpdatePreferences>): Promise<Preferences> {
    this.preferences = {
      ...this.preferences,
      ...normalizeUpdatePreferences({
        ...this.preferences,
        ...updatePreferences
      })
    };
    await this.save();
    return this.get();
  }

  async updateViewerPreferences(viewerPreferences: Partial<ViewerPreferences>): Promise<Preferences> {
    this.preferences = {
      ...this.preferences,
      ...normalizeViewerPreferences({
        ...this.preferences,
        ...viewerPreferences
      })
    };
    await this.save();
    return this.get();
  }

  async addRecent(source: LibrarySource): Promise<Preferences> {
    const recentSource: RecentSource = {
      ...source,
      openedAt: new Date().toISOString()
    };
    this.preferences.recent = [
      recentSource,
      ...this.preferences.recent.filter((entry) => entry.id !== recentSource.id)
    ].slice(0, MAX_RECENT);
    await this.save();
    return this.get();
  }

  findRecent(sourceId: string): RecentSource | undefined {
    return this.preferences.recent.find((source) => source.id === sourceId);
  }

  async reset(): Promise<Preferences> {
    this.preferences = defaultPreferences();
    await this.save();
    return this.get();
  }

  private async backupCorruptSettings(): Promise<string | undefined> {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "")
      .replace("T", "-");
    const backupPath = path.join(path.dirname(this.settingsPath), `settings.corrupt-${timestamp}.json`);
    try {
      await rename(this.settingsPath, backupPath);
      return backupPath;
    } catch {
      // If the file cannot be moved, still recreate defaults so the app can start.
      return undefined;
    }
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, `${JSON.stringify(this.preferences, null, 2)}\n`, "utf8");
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
