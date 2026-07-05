import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CHROME_PREFERENCES, normalizeChromePreferences } from "../shared/chromePreferences";
import { SettingsStore } from "./settings";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-chrome-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("chrome preferences", () => {
  it("defaults the top and bottom bars to auto hide", () => {
    expect(normalizeChromePreferences()).toEqual(DEFAULT_CHROME_PREFERENCES);
    expect(DEFAULT_CHROME_PREFERENCES.topBarMode).toBe("auto");
    expect(DEFAULT_CHROME_PREFERENCES.bottomBarMode).toBe("auto");
  });

  it("recovers invalid stored chrome modes to auto", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      path.join(tempDir, "settings.json"),
      '{"topBarMode":"floating","bottomBarMode":"locked","recent":[]}',
      "utf8"
    );

    const store = new SettingsStore(tempDir);
    const preferences = await store.load();
    expect(preferences.topBarMode).toBe("auto");
    expect(preferences.bottomBarMode).toBe("auto");
  });

  it("persists always visible chrome modes", async () => {
    const store = new SettingsStore(tempDir);
    await store.load();
    await store.updateChromePreferences({
      topBarMode: "always",
      bottomBarMode: "always"
    });

    const saved = JSON.parse(await readFile(path.join(tempDir, "settings.json"), "utf8")) as Record<string, unknown>;
    expect(saved.topBarMode).toBe("always");
    expect(saved.bottomBarMode).toBe("always");

    const reloaded = new SettingsStore(tempDir);
    const preferences = await reloaded.load();
    expect(preferences.topBarMode).toBe("always");
    expect(preferences.bottomBarMode).toBe("always");
  });

  it("updates the top bar mode without rewriting the deprecated bottom bar mode", async () => {
    const store = new SettingsStore(tempDir);
    await store.load();
    await store.updateChromePreferences({
      bottomBarMode: "always"
    });
    await store.updateChromePreferences({
      topBarMode: "always"
    });

    const saved = JSON.parse(await readFile(path.join(tempDir, "settings.json"), "utf8")) as Record<string, unknown>;
    expect(saved.topBarMode).toBe("always");
    expect(saved.bottomBarMode).toBe("always");
  });
});
