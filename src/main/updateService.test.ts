import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdater, UpdateCheckResult } from "electron-updater";
import { resolveUpdateSupport, UpdateService } from "./updateService";

const currentVersion = "0.2.6";
const nextVersion = "0.2.7";

function fakeFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  })) as unknown as typeof fetch;
}

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
      updater: fakeAppUpdater(updater),
      fetchImpl: fakeFetch({
        tag_name: `v${nextVersion}`,
        name: `SuwolView ${nextVersion}`,
        published_at: "2026-07-20T00:00:00.000Z",
        body: "Release notes",
        html_url: "https://github.com/suwol-suite/SuwolView/releases/tag/v0.2.7",
        assets: [{ name: "latest-linux.yml" }, { name: "SuwolView-0.2.7.AppImage" }]
      })
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
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

    expect(service.installUpdate()).toMatchObject({ ok: true });
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("distinguishes latest, ahead, and missing-release outcomes", async () => {
    const base = {
      isPackaged: true,
      safeMode: false,
      platform: "win32" as const,
      version: currentVersion,
      updater: fakeAppUpdater()
    };
    await expect(
      new UpdateService({ ...base, fetchImpl: fakeFetch({ tag_name: "v0.2.6", assets: [] }) }).checkForUpdates()
    ).resolves.toMatchObject({ ok: true, data: { comparison: "up-to-date", status: "not-available" } });
    await expect(
      new UpdateService({ ...base, version: "0.3.0", fetchImpl: fakeFetch({ tag_name: "v0.2.6", assets: [] }) }).checkForUpdates()
    ).resolves.toMatchObject({ ok: true, data: { comparison: "ahead" } });
    await expect(
      new UpdateService({ ...base, fetchImpl: fakeFetch(undefined, 404) }).checkForUpdates()
    ).resolves.toMatchObject({ ok: true, data: { comparison: "no-release", status: "no-release" } });
  });

  it("returns a terminal timeout state even when the transport ignores abort", async () => {
    const fetchImpl = vi.fn(() => new Promise<never>(() => undefined)) as unknown as typeof fetch;
    await expect(
      new UpdateService({
        isPackaged: true,
        safeMode: false,
        platform: "darwin",
        version: currentVersion,
        timeoutMs: 5,
        fetchImpl,
        updater: fakeAppUpdater()
      }).checkForUpdates()
    ).resolves.toMatchObject({ ok: false, code: "UPDATE_CHECK_TIMEOUT", messageKey: "errors.updateCheckTimeout" });
  });

  it("keeps release details available when the native updater check times out", async () => {
    const updater = new FakeUpdater();
    updater.checkForUpdates.mockImplementation(() => new Promise<UpdateCheckResult | null>(() => undefined));
    const service = new UpdateService({
      isPackaged: true,
      safeMode: false,
      platform: "win32",
      version: currentVersion,
      nativeCheckTimeoutMs: 5,
      updater: fakeAppUpdater(updater),
      fetchImpl: fakeFetch({
        tag_name: "v0.2.10",
        name: "SuwolView 0.2.10",
        published_at: "2026-07-20T00:00:00.000Z",
        body: "Release notes",
        html_url: "https://github.com/suwol-suite/SuwolView/releases/tag/v0.2.10",
        assets: [{ name: "latest.yml" }, { name: "SuwolView-0.2.10-setup.exe" }]
      })
    });

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "available",
        updateAvailable: true,
        latestVersion: "0.2.10",
        nativeUpdaterStatus: "timeout",
        releaseLookupStatus: "success",
        error: { code: "UPDATE_NATIVE_CHECK_TIMEOUT" }
      }
    });
    expect(updater.listenerCount("update-available")).toBe(1);
  });

  it("does not create duplicate requests while a check is in flight", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchImpl = vi.fn(
      () => new Promise((resolve) => {
        resolveFetch = resolve;
      })
    ) as unknown as typeof fetch;
    const service = new UpdateService({
      isPackaged: true,
      safeMode: false,
      platform: "win32",
      version: currentVersion,
      fetchImpl,
      updater: fakeAppUpdater()
    });
    const first = service.checkForUpdates();
    const second = service.checkForUpdates();
    expect(first).toBe(second);
    resolveFetch?.({ ok: true, status: 200, json: async () => ({ tag_name: "v0.2.6", assets: [] }) });
    await expect(first).resolves.toMatchObject({ ok: true, data: { comparison: "up-to-date" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
