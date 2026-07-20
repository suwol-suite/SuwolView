import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AppUpdater, UpdateCheckResult } from "electron-updater";
import { NativeUpdaterCheckService } from "./nativeUpdater";

class FakeUpdater extends EventEmitter {
  checkForUpdates = vi.fn<() => Promise<UpdateCheckResult | null>>();
}

function updater(value: FakeUpdater): AppUpdater {
  return value as unknown as AppUpdater;
}

describe("native updater check", () => {
  it("registers before request, resolves on events, and removes listeners", async () => {
    const fake = new FakeUpdater();
    fake.checkForUpdates.mockImplementation(async () => {
      fake.emit("checking-for-update");
      fake.emit("update-available", { version: "0.2.10" });
      return null;
    });
    const service = new NativeUpdaterCheckService(updater(fake), 100);
    await expect(service.check("request-1")).resolves.toMatchObject({ status: "available" });
    expect(fake.listenerCount("update-available")).toBe(0);
    expect(fake.listenerCount("update-not-available")).toBe(0);
    expect(fake.listenerCount("error")).toBe(0);
  });

  it("shares duplicate checks and handles Promise rejection", async () => {
    const fake = new FakeUpdater();
    let resolveCheck: ((result: UpdateCheckResult) => void) | undefined;
    fake.checkForUpdates.mockImplementation(() => new Promise((resolve) => { resolveCheck = resolve; }));
    const service = new NativeUpdaterCheckService(updater(fake), 100);
    const first = service.check("request-1");
    const second = service.check("request-2");
    expect(first).toBe(second);
    resolveCheck?.({ updateInfo: { version: "0.2.10" } } as UpdateCheckResult);
    await expect(first).resolves.toMatchObject({ status: "available" });
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);

    fake.checkForUpdates.mockRejectedValueOnce(new Error("network"));
    await expect(service.check("request-3")).resolves.toMatchObject({ status: "error" });
  });

  it("times out, cleans up, and ignores late events and rejections", async () => {
    vi.useFakeTimers();
    try {
      const fake = new FakeUpdater();
      let rejectCheck: ((error: Error) => void) | undefined;
      fake.checkForUpdates.mockImplementation(() => new Promise((_resolve, reject) => { rejectCheck = reject; }));
      const service = new NativeUpdaterCheckService(updater(fake), 20);
      const pending = service.check("request-timeout");
      await vi.advanceTimersByTimeAsync(20);
      await expect(pending).resolves.toMatchObject({ status: "timeout" });
      fake.emit("update-available", { version: "0.2.11" });
      rejectCheck?.(new Error("late rejection"));
      await Promise.resolve();
      expect(fake.listenerCount("update-available")).toBe(0);
      expect(fake.listenerCount("error")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
