import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ensureInside } from "./pathValidation";

export interface CacheStats {
  thumbnailEntries: number;
  thumbnailSizeBytes: number;
  cacheSizeBytes: number;
}

export interface CacheMaintenanceResult {
  stats: CacheStats;
  removedEntries: number;
  removedBytes: number;
}

const OLD_THUMBNAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class CachePaths {
  readonly root: string;
  readonly archiveRoot: string;
  readonly conversionRoot: string;
  readonly thumbnailRoot: string;

  constructor(userDataPath: string) {
    this.root = path.join(userDataPath, "cache");
    this.archiveRoot = path.join(this.root, "archives");
    this.conversionRoot = path.join(this.root, "converted");
    this.thumbnailRoot = path.join(this.root, "thumbnails");
  }

  async ensure(): Promise<void> {
    await Promise.all([
      mkdir(this.archiveRoot, { recursive: true }),
      mkdir(this.conversionRoot, { recursive: true }),
      mkdir(this.thumbnailRoot, { recursive: true })
    ]);
  }

  async clearThumbnails(): Promise<void> {
    await rm(this.thumbnailRoot, { recursive: true, force: true });
    await mkdir(this.thumbnailRoot, { recursive: true });
  }

  async clearThumbnailCache(): Promise<CacheMaintenanceResult> {
    const before = await this.getStats();
    await this.clearThumbnails();
    const after = await this.getStats();
    return {
      stats: after,
      removedEntries: before.thumbnailEntries,
      removedBytes: before.thumbnailSizeBytes
    };
  }

  async cleanupThumbnails(maxAgeMs = OLD_THUMBNAIL_MAX_AGE_MS, now = Date.now()): Promise<CacheMaintenanceResult> {
    await mkdir(this.thumbnailRoot, { recursive: true });
    const removed = await removeOldFiles(this.thumbnailRoot, maxAgeMs, now);
    const after = await this.getStats();
    return {
      stats: after,
      removedEntries: removed.entries,
      removedBytes: removed.sizeBytes
    };
  }

  async getStats(): Promise<CacheStats> {
    await this.ensure();
    const [thumbnailStats, totalStats] = await Promise.all([directoryStats(this.thumbnailRoot), directoryStats(this.root)]);
    return {
      thumbnailEntries: thumbnailStats.entries,
      thumbnailSizeBytes: thumbnailStats.sizeBytes,
      cacheSizeBytes: totalStats.sizeBytes
    };
  }

  archiveEntryPath(itemId: string, cacheKey: string, extension: string): string {
    return this.safeJoin(this.archiveRoot, `${itemId}-${cacheKey}.${extension}`);
  }

  convertedPath(itemId: string, cacheKey: string): string {
    return this.safeJoin(this.conversionRoot, `${itemId}-${cacheKey}.png`);
  }

  thumbnailPath(itemId: string, cacheKey: string): string {
    return this.safeJoin(this.thumbnailRoot, `${itemId}-${cacheKey}.webp`);
  }

  private safeJoin(rootPath: string, fileName: string): string {
    return ensureInside(rootPath, path.join(rootPath, fileName));
  }
}

async function directoryStats(rootPath: string): Promise<{ entries: number; sizeBytes: number }> {
  let entries = 0;
  let sizeBytes = 0;
  let children;
  try {
    children = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return { entries, sizeBytes };
  }

  for (const child of children) {
    const childPath = path.join(rootPath, child.name);
    if (child.isDirectory()) {
      const childStats = await directoryStats(childPath);
      entries += childStats.entries;
      sizeBytes += childStats.sizeBytes;
    } else if (child.isFile()) {
      try {
        const fileStats = await stat(childPath);
        entries += 1;
        sizeBytes += fileStats.size;
      } catch {
        // Cache files can disappear while maintenance is running.
      }
    }
  }

  return { entries, sizeBytes };
}

async function removeOldFiles(rootPath: string, maxAgeMs: number, now: number): Promise<{ entries: number; sizeBytes: number }> {
  let entries = 0;
  let sizeBytes = 0;
  let children;
  try {
    children = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return { entries, sizeBytes };
  }

  for (const child of children) {
    const childPath = path.join(rootPath, child.name);
    if (child.isDirectory()) {
      const childRemoved = await removeOldFiles(childPath, maxAgeMs, now);
      entries += childRemoved.entries;
      sizeBytes += childRemoved.sizeBytes;
      continue;
    }
    if (!child.isFile()) continue;

    try {
      const fileStats = await stat(childPath);
      if (now - fileStats.mtimeMs <= maxAgeMs) continue;
      await rm(childPath, { force: true });
      entries += 1;
      sizeBytes += fileStats.size;
    } catch {
      // Ignore cache entries that cannot be inspected or were removed concurrently.
    }
  }

  return { entries, sizeBytes };
}
