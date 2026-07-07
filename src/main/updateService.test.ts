import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdater, UpdateCheckResult } from "electron-updater";
import { resolveUpdateSupport, UpdateService } from "./updateService";

const currentVersion = "0.2.5";
const nextVersion = "0.2.6";

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn<() => Promise<UpdateCheckResult | null>>();
  downloadUpdate = vi.fn<() => Promise<string[]>>();
  quitAndInstall = vi.fn();
}

function fakeAppUpdater(updater = new FakeUpdater()): AppUpdater {
  return updater as unknown as AppUpdater;
}

describe("update service support matrix", () => {
  it("disables update checks in development mode", () => {
    expect(
      resolveUpdateSupport({
        isPackaged: false,
        safeMode: false,
        platform: "linux",
        appImagePath: "/tmp/SuwolView.AppImage",
        version: currentVersion
      })
    ).toMatchObject({ supported: false, status: "disabled", reason: { code: "UPDATE_DISABLED_DEV" } });
  });

  it("disables macOS update checks in development mode", () => {
    expect(
      resolveUpdateSupport({
        isPackaged: false,
        safeMode: false,
        platform: "darwin",
        version: currentVersion
      })
    ).toMatchObject({ supported: false, status: "disabled", reason: { code: "UPDATE_DISABLED_DEV" } });
  });

  it("disables update checks in safe mode", () => {
    expect(
      resolveUpdateSupport({
        isPackaged: true,
        safeMode: true,
        platform: "linux",
        appImagePath: "/tmp/SuwolView.AppImage",
        version: currentVersion
      })
    ).toMatchObject({ supported: false, status: "disabled", reason: { code: "UPDATE_DISABLED_SAFE_MODE" } });
  });

  it("disables packaged macOS update checks in safe mode", () => {
    expect(
      resolveUpdateSupport({
        isPackaged: true,
        safeMode: true,
        platform: "darwin",
        version: currentVersion
      })
    ).toMatchObject({ supported: false, status: "disabled", reason: { code: "UPDATE_DISABLED_SAFE_MODE" } });
  });

  it("supports packaged signed macOS builds", () => {
    expect(
      resolveUpdateSupport({
        isPackaged: true,
        safeMode: false,
        platform: "darwin",
        version: currentVersion
      })
    ).toMatchObject({ supported: true, status: "idle" });
  });

  it("treats Linux tar.gz or dir runs as unsupported for in-app updates", () => {
    expect(
      resolveUpdateSupport({
        isPackaged: true,
        safeMode: false,
        platform: "linux",
        version: currentVersion
      })
    ).toMatchObject({ supported: false, status: "unsupported", reason: { code: "UPDATE_UNSUPPORTED_LINUX_PACKAGE" } });
  });

  it("supports packaged Linux AppImage runs", () => {
    expect(
      resolveUpdateSupport({
        isPackaged: true,
        safeMode: false,
        platform: "linux",
        appImagePath: "/tmp/SuwolView.AppImage",
        version: currentVersion
      })
    ).toMatchObject({ supported: true, status: "idle" });
  });

  it("uses structured AppResult errors when unsupported", async () => {
    const service = new UpdateService({
      isPackaged: false,
      safeMode: false,
      platform: "win32",
      version: currentVersion,
      updater: fakeAppUpdater()
    });

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      ok: false,
      code: "UPDATE_DISABLED_DEV",
      messageKey: "errors.updateDisabledDev"
    });
  });

  it("checks and downloads updates through the injected updater", async () => {
    const updater = new FakeUpdater();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-available", { version: nextVersion, releaseName: `SuwolView ${nextVersion}` });
      return { updateInfo: { version: nextVersion, files: [], path: "", sha512: "" } } as unknown as UpdateCheckResult;
    });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit("update-downloaded", { version: nextVersion, releaseName: `SuwolView ${nextVersion}` });
      return [];
    });
    const service = new UpdateService({
      isPackaged: true,
      safeMode: false,
      platform: "linux",
      appImagePath: "/tmp/SuwolView.AppImage",
      version: currentVersion,
      updater: fakeAppUpdater(updater)
    });

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "available",
        updateAvailable: true,
        latestVersion: nextVersion
      }
    });
    await expect(service.downloadUpdate()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "downloaded",
        downloaded: true
      }
    });

    expect(service.installUpdate()).toMatchObject({ ok: true });
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
