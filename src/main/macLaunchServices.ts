import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const LSREGISTER_PATH = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BUFFER = 512 * 1024;

export interface MacRegisteredApplication {
  bundleIdentifier: string;
  bundlePath: string;
  version?: string;
  bundleVersion?: string;
  exists: boolean;
}

export interface LaunchServicesCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type LaunchServicesRunner = (args: readonly string[]) => Promise<LaunchServicesCommandResult>;

export interface MacLaunchServicesCleanupContext {
  bundleIdentifier: string;
  currentAppPath: string;
  runningAppPath?: string;
  updaterRoots: readonly string[];
}

export interface MacLaunchServicesCleanupResult {
  inspectedCount: number;
  staleCount: number;
  unregisteredCount: number;
  failedCount: number;
  currentRegistrationSucceeded: boolean;
}

function normalizePath(value: string): string {
  return path.normalize(value);
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function pathInside(root: string, candidate: string): boolean {
  const relative = path.relative(normalizePath(root), normalizePath(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function resolveMacAppBundleRoot(executablePath: string): string | undefined {
  const absolutePath = path.resolve(executablePath);
  const segments = absolutePath.split(path.sep);
  let bundleEnd = -1;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].toLowerCase().endsWith(".app")) {
      bundleEnd = index;
      break;
    }
  }
  if (bundleEnd < 0) return undefined;
  const root = segments.slice(0, bundleEnd + 1).join(path.sep) || path.sep;
  return root.toLowerCase().endsWith(".app") ? root : undefined;
}

export function macUpdaterCacheRoot(appName: string, homeDirectory = os.homedir()): string {
  return path.join(homeDirectory, "Library", "Caches", appName);
}

export function isUpdaterManagedPath(bundlePath: string, updaterRoots: readonly string[]): boolean {
  const normalizedBundlePath = normalizePath(bundlePath);
  return updaterRoots.some((root) => pathInside(root, normalizedBundlePath));
}

function parseField(block: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const match = block.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+?)\\s*$`, "im"));
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export function parseLaunchServicesDump(output: string): MacRegisteredApplication[] {
  const applications: MacRegisteredApplication[] = [];
  const blocks = output.split(/\n\s*\n+/u);
  const seen = new Set<string>();
  for (const block of blocks) {
    const bundlePath = parseField(block, ["path"]);
    const bundleIdentifier = parseField(block, ["bundle id", "bundle identifier"]);
    if (!bundlePath || !bundleIdentifier || !bundlePath.toLowerCase().endsWith(".app")) continue;
    const key = `${bundleIdentifier}\0${normalizePath(bundlePath)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    applications.push({
      bundleIdentifier,
      bundlePath,
      version: parseField(block, ["version", "short version"]),
      bundleVersion: parseField(block, ["bundle version", "bundle-version"]),
      exists: existsSync(bundlePath)
    });
  }
  return applications;
}

export function shouldUnregisterMacApplication(
  entry: MacRegisteredApplication,
  context: MacLaunchServicesCleanupContext
): boolean {
  if (entry.bundleIdentifier !== context.bundleIdentifier) return false;
  if (samePath(entry.bundlePath, context.currentAppPath)) return false;
  if (context.runningAppPath && samePath(entry.bundlePath, context.runningAppPath)) return false;
  return !entry.exists || isUpdaterManagedPath(entry.bundlePath, context.updaterRoots);
}

export function runLaunchServicesCommand(
  args: readonly string[],
  options: { timeoutMs?: number; maxBuffer?: number } = {}
): Promise<LaunchServicesCommandResult> {
  return new Promise((resolve) => {
    execFile(
      LSREGISTER_PATH,
      [...args],
      {
        shell: false,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER
      },
      (error, stdout, stderr) => {
        const code = typeof error?.code === "number" ? error.code : error ? -1 : 0;
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code });
      }
    );
  });
}

export async function cleanupMacLaunchServices(
  context: MacLaunchServicesCleanupContext,
  runner: LaunchServicesRunner = (args) => runLaunchServicesCommand(args)
): Promise<MacLaunchServicesCleanupResult> {
  const dump = await runner(["-dump"]);
  const entries = dump.code === 0 ? parseLaunchServicesDump(dump.stdout) : [];
  const staleEntries = entries.filter((entry) => shouldUnregisterMacApplication(entry, context));
  let unregisteredCount = 0;
  let failedCount = dump.code === 0 ? 0 : 1;

  for (const entry of staleEntries) {
    const result = await runner(["-u", entry.bundlePath]);
    if (result.code === 0) unregisteredCount += 1;
    else failedCount += 1;
  }

  const registration = await runner(["-f", context.currentAppPath]);
  if (registration.code !== 0) failedCount += 1;
  return {
    inspectedCount: entries.length,
    staleCount: staleEntries.length,
    unregisteredCount,
    failedCount,
    currentRegistrationSucceeded: registration.code === 0
  };
}
