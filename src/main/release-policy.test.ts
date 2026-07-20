import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";

describe("release policy", () => {
  it("marks the project package as Apache-2.0 licensed", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { license?: string; version?: string };

    expect(packageJson.version).toBe("0.2.10");
    expect(packageJson.license).toBe("Apache-2.0");
  });

  it("keeps maintenance IPC channels explicit", () => {
    expect(IPC_CHANNELS.getRuntimeInfo).toBe("app:get-runtime-info");
    expect(IPC_CHANNELS.openLogsFolder).toBe("app:open-logs-folder");
    expect(IPC_CHANNELS.getLogInfo).toBe("app:get-log-info");
    expect(IPC_CHANNELS.resetSettings).toBe("settings:reset");
    expect(IPC_CHANNELS.getCacheStats).toBe("cache:get-stats");
    expect(IPC_CHANNELS.clearThumbnailCache).toBe("cache:clear-thumbnails");
    expect(IPC_CHANNELS.cleanupThumbnailCache).toBe("cache:cleanup-thumbnails");
    expect(IPC_CHANNELS.restartInSafeMode).toBe("app:restart-in-safe-mode");
    expect(IPC_CHANNELS.writeRendererLog).toBe("app:write-renderer-log");
    expect(IPC_CHANNELS.updateUpdatePreferences).toBe("update:setPreferences");
    expect(IPC_CHANNELS.updateViewerPreferences).toBe("settings:update-viewer-preferences");
    expect(IPC_CHANNELS.getUpdateStatus).toBe("update:getStatus");
    expect(IPC_CHANNELS.checkForUpdates).toBe("update:check");
    expect(IPC_CHANNELS.downloadUpdate).toBe("update:download");
    expect(IPC_CHANNELS.installUpdate).toBe("update:install");
  });

  it("documents core-first release publishing with later macOS attach", async () => {
    const readme = await readFile("README.md", "utf8");
    const releaseNotes = await readFile("docs/release-notes-0.2.7.md", "utf8");
    const manualQc = await readFile("docs/manual-qc-0.2.6.md", "utf8");

    expect(readme).toContain("Windows and Linux assets are published first.");
    expect(readme).toContain("macOS Apple Silicon assets may be attached later after Apple notarization completes.");
    expect(readme).toContain("checksums.txt` and `checksums.txt.asc` are updated when macOS assets are attached.");
    expect(readme).toContain("Intel Mac is not supported.");
    expect(releaseNotes).toContain("Windows/Linux assets may appear before macOS assets.");
    expect(releaseNotes).toContain("macOS assets are attached to the same Release after notarization and stapling complete.");
    expect(releaseNotes).toContain("checksums.txt` and `checksums.txt.asc` are regenerated after macOS assets are attached.");
    expect(manualQc).toContain("Windows/Linux assets are available immediately after the core release job");
    expect(manualQc).toContain("After macOS attach, checksums.txt includes macOS files");
    expect(manualQc).toContain("After macOS attach, latest-mac.yml is uploaded");
  });
});
