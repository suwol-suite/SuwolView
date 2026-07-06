import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeModePreferences, SettingsStore } from "./settings";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-settings-recovery-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("settings recovery", () => {
  it("backs up corrupt settings JSON and recreates defaults", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(path.join(tempDir, "settings.json"), "{not-json", "utf8");

    const store = new SettingsStore(tempDir);
    const preferences = await store.load();
    const files = await readdir(tempDir);

    expect(preferences.theme).toBe("dark");
    expect(files.some((file) => /^settings\.corrupt-\d{8}-\d{6}\.json$/.test(file))).toBe(true);
    expect(JSON.parse(await readFile(path.join(tempDir, "settings.json"), "utf8")).theme).toBe("dark");
  });

  it("normalizes invalid settings values instead of keeping unsafe preferences", async () => {
    await writeFile(
      path.join(tempDir, "settings.json"),
      JSON.stringify({
        theme: "neon",
        language: "zz",
        topBarMode: "floating",
        leftPanelVisible: "yes",
        leftPanelWidth: 99999,
        rightPanelWidth: -1,
        recent: []
      }),
      "utf8"
    );

    const store = new SettingsStore(tempDir);
    const preferences = await store.load();

    expect(preferences.theme).toBe("dark");
    expect(preferences.language).toBe("system");
    expect(preferences.topBarMode).toBe("auto");
    expect(preferences.leftPanelVisible).toBe(false);
    expect(preferences.leftPanelWidth).toBe(520);
    expect(preferences.rightPanelWidth).toBe(240);
  });

  it("uses safe mode defaults without persisting over existing settings", async () => {
    await writeFile(
      path.join(tempDir, "settings.json"),
      JSON.stringify({ theme: "light", leftPanelVisible: true, rightPanelVisible: true, recent: [] }),
      "utf8"
    );

    const store = new SettingsStore(tempDir);
    const preferences = await store.load({ safeMode: true });

    expect(preferences).toMatchObject(safeModePreferences());
    expect(JSON.parse(await readFile(path.join(tempDir, "settings.json"), "utf8")).theme).toBe("light");
  });

  it("resets persisted settings to defaults", async () => {
    const store = new SettingsStore(tempDir);
    await store.load();
    await store.setTheme("light");

    const reset = await store.reset();
    expect(reset.theme).toBe("dark");
    expect(JSON.parse(await readFile(path.join(tempDir, "settings.json"), "utf8")).theme).toBe("dark");
  });
});
