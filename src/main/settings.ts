import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LibrarySource, Preferences, RecentSource, ThemeMode } from "../shared/types";

const MAX_RECENT = 12;

function defaultPreferences(): Preferences {
  return {
    theme: "dark",
    showThumbnails: true,
    showInfo: true,
    recent: []
  };
}

export class SettingsStore {
  private preferences = defaultPreferences();
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "settings.json");
  }

  async load(): Promise<Preferences> {
    try {
      const data = JSON.parse(await readFile(this.settingsPath, "utf8")) as Partial<Preferences>;
      this.preferences = {
        ...defaultPreferences(),
        ...data,
        recent: Array.isArray(data.recent) ? data.recent.slice(0, MAX_RECENT) : []
      };
    } catch {
      this.preferences = defaultPreferences();
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

  async setPanelState(showThumbnails: boolean, showInfo: boolean): Promise<Preferences> {
    this.preferences.showThumbnails = showThumbnails;
    this.preferences.showInfo = showInfo;
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

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, `${JSON.stringify(this.preferences, null, 2)}\n`, "utf8");
  }
}
