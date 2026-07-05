import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsStore } from "./settings";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-settings-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("settings language", () => {
  it("loads system as the default language setting", async () => {
    const store = new SettingsStore(tempDir);
    const preferences = await store.load();
    expect(preferences.language).toBe("system");
  });

  it("persists selected language settings", async () => {
    const store = new SettingsStore(tempDir);
    await store.load();
    expect((await store.setLanguage("ko")).language).toBe("ko");

    const reloaded = new SettingsStore(tempDir);
    expect((await reloaded.load()).language).toBe("ko");
  });

  it("recovers invalid stored language settings to system", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(path.join(tempDir, "settings.json"), '{"language":"fr","recent":[]}', "utf8");

    const store = new SettingsStore(tempDir);
    expect((await store.load()).language).toBe("system");
  });
});
