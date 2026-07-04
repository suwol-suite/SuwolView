import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ensureInside } from "./pathValidation";

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
