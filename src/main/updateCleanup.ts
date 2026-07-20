import path from "node:path";
import type { Preferences } from "../shared/types";
import {
  cleanupMacLaunchServices,
  macUpdaterCacheRoot,
  resolveMacAppBundleRoot,
  runLaunchServicesCommand,
  type LaunchServicesRunner
} from "./macLaunchServices";
import { logMain } from "./logging";

interface CleanupSettings {
  get(): Preferences;
  recordLaunchVersion(version: string): Promise<Preferences>;
  recordMacUpdateCleanup(version: string, result: Preferences["lastMacUpdateCleanupResult"]): Promise<Preferences>;
}

export interface MacUpdateCleanupOptions {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  version: string;
  executablePath: string;
  bundleIdentifier: string;
  appName: string;
  userDataPath: string;
  settings: CleanupSettings;
  runner?: LaunchServicesRunner;
}

export async function runMacUpdateCleanup(options: MacUpdateCleanupOptions): Promise<void> {
  if (options.platform !== "darwin" || !options.isPackaged) return;

  const preferences = options.settings.get();
  const versionChanged = Boolean(preferences.lastLaunchVersion && preferences.lastLaunchVersion !== options.version);
  const alreadyCleaned = preferences.lastMacUpdateCleanupVersion === options.version;

  try {
    await options.settings.recordLaunchVersion(options.version);
  } catch (error) {
    logMain("Unable to persist launch version", { error }, "warn");
  }

  if (!versionChanged || alreadyCleaned) return;

  try {
    const currentAppPath = resolveMacAppBundleRoot(options.executablePath);
    if (!currentAppPath) {
      await options.settings.recordMacUpdateCleanup(options.version, "skipped");
      logMain("macOS update registration cleanup skipped: current app bundle was not resolved", undefined, "warn");
      return;
    }

    const cacheRoot = macUpdaterCacheRoot(options.appName);
    const updaterRoots = [
      cacheRoot,
      path.join(cacheRoot, "pending"),
      path.join(options.userDataPath, "pending"),
      path.join(options.userDataPath, "updates")
    ];
    const result = await cleanupMacLaunchServices(
      {
        bundleIdentifier: options.bundleIdentifier,
        currentAppPath,
        runningAppPath: currentAppPath,
        updaterRoots
      },
      options.runner ?? ((args) => runLaunchServicesCommand(args))
    );
    const cleanupResult = result.currentRegistrationSucceeded
      ? result.failedCount === 0 ? "success" : "partial"
      : "failed";
    await options.settings.recordMacUpdateCleanup(options.version, cleanupResult);
    logMain("macOS update registration cleanup completed", {
      inspectedCount: result.inspectedCount,
      staleCount: result.staleCount,
      unregisteredCount: result.unregisteredCount,
      failedCount: result.failedCount,
      currentRegistrationSucceeded: result.currentRegistrationSucceeded
    }, result.failedCount === 0 ? "info" : "warn");
  } catch (error) {
    try {
      await options.settings.recordMacUpdateCleanup(options.version, "failed");
    } catch (recordError) {
      logMain("Unable to persist macOS update cleanup result", { error: recordError }, "warn");
    }
    logMain("macOS update registration cleanup failed; continuing startup", { error }, "warn");
  }
}
