import { describe, expect, it } from "vitest";
import type { Preferences } from "../shared/types";
import { runMacUpdateCleanup } from "./updateCleanup";

function fakePreferences(overrides: Partial<Preferences> = {}): Preferences {
  return {
    theme: "dark",
    language: "system",
    checkForUpdatesOnStartup: false,
    topBarMode: "auto",
    bottomBarMode: "auto",
    leftPanelVisible: true,
    rightPanelVisible: true,
    leftPanelWidth: 220,
    rightPanelWidth: 300,
    viewMode: "fit-window",
    upscaleSmallImages: true,
    interpolationFilter: "bilinear",
    filterPreset: "smooth",
    hdrEnabled: false,
    showZoomPercent: false,
    resetZoomOnImageChange: true,
    recent: [],
    ...overrides
  };
}

describe("macOS update cleanup lifecycle", () => {
  it("records the first launch without invoking Launch Services", async () => {
    const versions: string[] = [];
    let calls = 0;
    const settings = {
      value: fakePreferences(),
      get() { return this.value; },
      async recordLaunchVersion(version: string) { versions.push(version); this.value.lastLaunchVersion = version; return this.value; },
      async recordMacUpdateCleanup(version: string, result: Preferences["lastMacUpdateCleanupResult"]) { this.value.lastMacUpdateCleanupVersion = version; this.value.lastMacUpdateCleanupResult = result; return this.value; }
    };
    await runMacUpdateCleanup({
      platform: "darwin",
      isPackaged: true,
      version: "0.2.8",
      executablePath: "/Applications/SuwolView.app/Contents/MacOS/SuwolView",
      bundleIdentifier: "org.suwolview.app",
      appName: "SuwolView",
      userDataPath: "/Users/test/Library/Application Support/SuwolView",
      settings,
      runner: async () => { calls += 1; return { code: 0, stdout: "", stderr: "" }; }
    });
    expect(versions).toEqual(["0.2.8"]);
    expect(calls).toBe(0);
  });

  it("runs once after a version change and does not block on runner failure", async () => {
    const settings = {
      value: fakePreferences({ lastLaunchVersion: "0.2.6" }),
      get() { return this.value; },
      async recordLaunchVersion(version: string) { this.value.lastLaunchVersion = version; return this.value; },
      async recordMacUpdateCleanup(version: string, result: Preferences["lastMacUpdateCleanupResult"]) { this.value.lastMacUpdateCleanupVersion = version; this.value.lastMacUpdateCleanupResult = result; return this.value; }
    };
    let calls = 0;
    await expect(runMacUpdateCleanup({
      platform: "darwin",
      isPackaged: true,
      version: "0.2.8",
      executablePath: "/Applications/SuwolView.app/Contents/MacOS/SuwolView",
      bundleIdentifier: "org.suwolview.app",
      appName: "SuwolView",
      userDataPath: "/Users/test/Library/Application Support/SuwolView",
      settings,
      runner: async () => { calls += 1; throw new Error("lsregister unavailable"); }
    })).resolves.toBeUndefined();
    expect(calls).toBe(1);
    expect(settings.value.lastMacUpdateCleanupResult).toBe("failed");
  });
});
