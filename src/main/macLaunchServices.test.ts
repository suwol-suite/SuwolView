import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupMacLaunchServices,
  isUpdaterManagedPath,
  parseLaunchServicesDump,
  resolveMacAppBundleRoot,
  shouldUnregisterMacApplication
} from "./macLaunchServices";

describe("macOS Launch Services cleanup", () => {
  it("resolves the real app bundle root from the executable path", () => {
    const executablePath = "/Applications/SuwolView.app/Contents/MacOS/SuwolView";
    expect(resolveMacAppBundleRoot(executablePath)).toBe(path.resolve("/Applications/SuwolView.app"));
    expect(resolveMacAppBundleRoot("/tmp/SuwolView/dist-electron/main.cjs")).toBeUndefined();
  });

  it("parses only structurally valid registrations and keeps existence information", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-ls-"));
    try {
      const appPath = path.join(tempDir, "Old.app");
      await mkdir(appPath, { recursive: true });
      const entries = parseLaunchServicesDump(`path: ${appPath}\nbundle id: org.suwolview.app\nversion: 0.2.6\nbundle version: 26\n\nmalformed`);
      expect(entries).toEqual([expect.objectContaining({ bundleIdentifier: "org.suwolview.app", bundlePath: appPath, exists: true })]);
      expect(parseLaunchServicesDump("path: /tmp/no-id.app\nversion: 1")).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves other bundle IDs and user-installed copies", () => {
    const context = {
      bundleIdentifier: "org.suwolview.app",
      currentAppPath: "/Applications/SuwolView.app",
      runningAppPath: "/Applications/SuwolView.app",
      updaterRoots: ["/Users/test/Library/Caches/SuwolView"]
    };
    expect(shouldUnregisterMacApplication({ bundleIdentifier: "other.app", bundlePath: "/tmp/old.app", exists: false }, context)).toBe(false);
    expect(shouldUnregisterMacApplication({ bundleIdentifier: context.bundleIdentifier, bundlePath: "/Applications/SuwolView.app", exists: true }, context)).toBe(false);
    expect(shouldUnregisterMacApplication({ bundleIdentifier: context.bundleIdentifier, bundlePath: "/Applications/OtherSuwolView.app", exists: true }, context)).toBe(false);
    expect(isUpdaterManagedPath("/Users/test/Library/Caches/SuwolView/pending/0.2.7/SuwolView.app", context.updaterRoots)).toBe(true);
  });

  it("unregisters only stale matching entries and registers the current app", async () => {
    const calls: string[][] = [];
    const result = await cleanupMacLaunchServices(
      {
        bundleIdentifier: "org.suwolview.app",
        currentAppPath: "/Applications/SuwolView.app",
        updaterRoots: ["/Users/test/Library/Caches/SuwolView"]
      },
      async (args) => {
        calls.push([...args]);
        if (args[0] === "-dump") {
          return {
            code: 0,
            stderr: "",
            stdout: [
              "path: /Users/test/Library/Caches/SuwolView/pending/old/SuwolView.app",
              "bundle id: org.suwolview.app",
              "",
              "path: /Applications/SuwolView.app",
              "bundle id: org.suwolview.app",
              "",
              "path: /Applications/Other.app",
              "bundle id: other.app"
            ].join("\n")
          };
        }
        return { code: 0, stderr: "", stdout: "" };
      }
    );
    expect(result).toMatchObject({ inspectedCount: 3, staleCount: 1, unregisteredCount: 1, failedCount: 0, currentRegistrationSucceeded: true });
    expect(calls).toEqual([
      ["-dump"],
      ["-u", "/Users/test/Library/Caches/SuwolView/pending/old/SuwolView.app"],
      ["-f", "/Applications/SuwolView.app"]
    ]);
  });
});
