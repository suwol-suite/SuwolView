import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeChromePreferences } from "../shared/chromePreferences";
import { normalizeLanguagePreference } from "../shared/i18n/languages";
import { normalizePanelPreferences } from "../shared/panelPreferences";
import type {
  AppLanguageSetting,
  ChromePreferences,
  LibrarySource,
  PanelPreferences,
  Preferences,
  RecentSource,
  ThemeMode
} from "../shared/types";

const MAX_RECENT = 12;

export function defaultPreferences(): Preferences {
  return {
    theme: "dark",
    language: "system",
    ...normalizeChromePreferences(),
    ...normalizePanelPreferences(),
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

export class SettingsStore {
  private preferences = defaultPreferences();
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "settings.json");
  }

  async load(options: { safeMode?: boolean } = {}): Promise<Preferences> {
    if (options.safeMode) {
      this.preferences = safeModePreferences();
      return this.get();
    }

    try {
      const rawData = await readFile(this.settingsPath, "utf8");
      const data = JSON.parse(rawData) as Partial<Preferences>;
      this.preferences = {
        ...defaultPreferences(),
        ...data,
        language: normalizeLanguagePreference(data.language),
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
        recent: Array.isArray(data.recent) ? data.recent.slice(0, MAX_RECENT) : []
      };
    } catch (error) {
      this.preferences = defaultPreferences();
      if (!isMissingFileError(error)) {
        await this.backupCorruptSettings();
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

  private async backupCorruptSettings(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${this.settingsPath}.corrupt-${timestamp}.json`;
    try {
      await rename(this.settingsPath, backupPath);
    } catch {
      // If the file cannot be moved, still recreate defaults so the app can start.
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
