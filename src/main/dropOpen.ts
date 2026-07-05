import { stat } from "node:fs/promises";
import path from "node:path";
import { isArchive, isSupportedImage } from "../shared/formats";

export type DropOpenTarget =
  | { type: "folder"; path: string }
  | { type: "image"; path: string }
  | { type: "images"; paths: string[] }
  | { type: "archive"; path: string }
  | { type: "unsupported" };

export function isUrlLikePath(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value.trim());
}

export function normalizeDroppedPaths(paths: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const droppedPath of paths) {
    if (typeof droppedPath !== "string") continue;
    const trimmed = droppedPath.trim();
    if (!trimmed || isUrlLikePath(trimmed)) continue;
    const resolved = path.resolve(trimmed);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (!seen.has(key)) {
      normalized.push(resolved);
      seen.add(key);
    }
  }

  return normalized;
}

export async function resolveDropOpenTarget(paths: readonly string[]): Promise<DropOpenTarget> {
  const normalized = normalizeDroppedPaths(paths);
  const directories: string[] = [];
  const images: string[] = [];
  const archives: string[] = [];

  for (const droppedPath of normalized) {
    let fileStat;
    try {
      fileStat = await stat(droppedPath);
    } catch {
      continue;
    }

    if (fileStat.isDirectory()) {
      directories.push(droppedPath);
    } else if (fileStat.isFile() && isSupportedImage(droppedPath)) {
      images.push(droppedPath);
    } else if (fileStat.isFile() && isArchive(droppedPath)) {
      archives.push(droppedPath);
    }
  }

  if (directories.length > 0) {
    return { type: "folder", path: directories[0] };
  }
  if (images.length > 1) {
    return { type: "images", paths: images };
  }
  if (images.length === 1) {
    return { type: "image", path: images[0] };
  }
  if (archives.length > 0) {
    return { type: "archive", path: archives[0] };
  }
  return { type: "unsupported" };
}
