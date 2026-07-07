import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";

describe("release policy", () => {
  it("marks the project package as Apache-2.0 licensed", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { license?: string; version?: string };

    expect(packageJson.version).toBe("0.2.4");
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
    expect(IPC_CHANNELS.getUpdateStatus).toBe("update:getStatus");
    expect(IPC_CHANNELS.checkForUpdates).toBe("update:check");
    expect(IPC_CHANNELS.downloadUpdate).toBe("update:download");
    expect(IPC_CHANNELS.installUpdate).toBe("update:install");
  });
});
