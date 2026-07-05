import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PANEL_PREFERENCES, LEFT_PANEL_MAX_WIDTH, LEFT_PANEL_MIN_WIDTH, normalizePanelPreferences } from "../shared/panelPreferences";
import { SettingsStore } from "./settings";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-panel-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("panel preferences", () => {
  it("defaults both side panels to hidden", () => {
    expect(normalizePanelPreferences()).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(DEFAULT_PANEL_PREFERENCES.leftPanelVisible).toBe(false);
    expect(DEFAULT_PANEL_PREFERENCES.rightPanelVisible).toBe(false);
  });

  it("clamps invalid panel widths", () => {
    expect(normalizePanelPreferences({ leftPanelWidth: 1 }).leftPanelWidth).toBe(LEFT_PANEL_MIN_WIDTH);
    expect(normalizePanelPreferences({ leftPanelWidth: 9999 }).leftPanelWidth).toBe(LEFT_PANEL_MAX_WIDTH);
    expect(normalizePanelPreferences({ rightPanelWidth: Number.NaN }).rightPanelWidth).toBe(
      DEFAULT_PANEL_PREFERENCES.rightPanelWidth
    );
  });

  it("migrates old showThumbnails and showInfo settings", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(path.join(tempDir, "settings.json"), '{"showThumbnails":true,"showInfo":false,"recent":[]}', "utf8");

    const store = new SettingsStore(tempDir);
    const preferences = await store.load();
    expect(preferences.leftPanelVisible).toBe(true);
    expect(preferences.rightPanelVisible).toBe(false);
  });

  it("persists panel visibility and width changes", async () => {
    const store = new SettingsStore(tempDir);
    await store.load();
    await store.updatePanelPreferences({
      leftPanelVisible: true,
      rightPanelVisible: true,
      leftPanelWidth: 333,
      rightPanelWidth: 444
    });

    const saved = JSON.parse(await readFile(path.join(tempDir, "settings.json"), "utf8")) as Record<string, unknown>;
    expect(saved.leftPanelVisible).toBe(true);
    expect(saved.rightPanelVisible).toBe(true);
    expect(saved.leftPanelWidth).toBe(333);
    expect(saved.rightPanelWidth).toBe(444);
  });
});
