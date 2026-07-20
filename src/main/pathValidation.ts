import path from "node:path";

export function ensureInside(rootPath: string, targetPath: string): string {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error("Resolved path is outside the expected root.");
}

export function isArchiveEntryPathSafe(entryName: string): boolean {
  if (
    !entryName ||
    entryName.includes("\0") ||
    /^[a-zA-Z]:/.test(entryName) ||
    entryName.startsWith("/") ||
    entryName.startsWith("\\") ||
    entryName.startsWith("//") ||
    entryName.startsWith("\\\\")
  ) {
    return false;
  }

  const normalized = entryName.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return parts.every((part) => part !== ".." && part !== "");
}

export function normalizeArchiveEntryName(entryName: string): string {
  if (!isArchiveEntryPathSafe(entryName)) {
    throw new Error(`Unsafe archive entry path: ${entryName}`);
  }
  return path.posix.normalize(entryName.replaceAll("\\", "/"));
}
