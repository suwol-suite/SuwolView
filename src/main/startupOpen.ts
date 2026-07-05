import path from "node:path";
import { isUrlLikePath } from "./dropOpen";

export interface LaunchArgvOptions {
  isPackaged: boolean;
  appPath?: string;
  execPath?: string;
}

const FLAGS_WITH_VALUE = new Set([
  "--inspect",
  "--inspect-brk",
  "--remote-debugging-port",
  "--user-data-dir",
  "--host-rules",
  "--host-resolver-rules",
  "--proxy-server"
]);

function normalizeForCompare(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left: string | undefined, right: string): boolean {
  if (!left) return false;
  try {
    return normalizeForCompare(left) === normalizeForCompare(right);
  } catch {
    return false;
  }
}

function isDevRuntimeArgument(value: string, options: LaunchArgvOptions): boolean {
  if (options.isPackaged) return false;
  return value === "." || samePath(options.appPath, value) || samePath(options.execPath, value);
}

function isViteOrElectronInternalArgument(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed) ||
    trimmed.startsWith("chrome-extension://") ||
    trimmed.startsWith("devtools://")
  );
}

export function extractLaunchPathArguments(argv: readonly string[], options: LaunchArgvOptions): string[] {
  const result: string[] = [];
  let afterTerminator = false;
  let skipNext = false;

  for (const arg of argv.slice(1)) {
    const value = arg.trim();
    if (!value) continue;

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (!afterTerminator && value === "--") {
      afterTerminator = true;
      continue;
    }

    if (!afterTerminator) {
      const flagName = value.includes("=") ? value.slice(0, value.indexOf("=")) : value;
      if (FLAGS_WITH_VALUE.has(flagName) && !value.includes("=")) {
        skipNext = true;
        continue;
      }
      if (value.startsWith("-")) continue;
      if (isDevRuntimeArgument(value, options)) continue;
      if (isViteOrElectronInternalArgument(value)) continue;
    }

    if (!isUrlLikePath(value)) {
      result.push(value);
    }
  }

  return result;
}
