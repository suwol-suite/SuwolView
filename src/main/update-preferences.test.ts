import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsStore } from "./settings";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-update-preferences-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("update preferences", () => {
  it("defaults startup update checks to disabled", async () => {
    const store = new SettingsStore(tempDir);
    const preferences = await store.load();

    expect(preferences.checkForUpdatesOnStartup).toBe(false);
  });

  it("persists update preference changes", async () => {
    const store = new SettingsStore(tempDir);
    await store.load();
    const preferences = await store.updateUpdatePreferences({ checkForUpdatesOnStartup: true });

    expect(preferences.checkForUpdatesOnStartup).toBe(true);
    expect(JSON.parse(await readFile(path.join(tempDir, "settings.json"), "utf8")).checkForUpdatesOnStartup).toBe(true);
  });

  it("safe mode keeps update checks disabled even when persisted settings enable them", async () => {
    const store = new SettingsStore(tempDir);
    await store.load();
    await store.updateUpdatePreferences({ checkForUpdatesOnStartup: true });

    const safeStore = new SettingsStore(tempDir);
    const preferences = await safeStore.load({ safeMode: true });

    expect(preferences.checkForUpdatesOnStartup).toBe(false);
  });
});
