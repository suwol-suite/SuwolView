import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getImageSupport } from "../shared/formats";
import type { ImageMetadata } from "../shared/types";
import { extractZipEntry } from "./archive";
import type { InternalLibraryItem, MetadataWorkerRequest, ResolvedImageFile, ThumbnailWorkerRequest } from "./libraryTypes";
import { electronWorkerPath, runWorker } from "./workerRunner";
import type { CachePaths } from "./cache";

export class DecoderLayer {
  private readonly metadataCache = new Map<string, ImageMetadata>();
  private readonly inFlightThumbnails = new Map<string, Promise<ResolvedImageFile>>();

  constructor(private readonly cache: CachePaths) {}

  async resolveDisplayFile(item: InternalLibraryItem): Promise<ResolvedImageFile> {
    const support = getImageSupport(item.extension);
    if (!support) {
      throw new Error(`Unsupported image format: ${item.extension}`);
    }

    const originalPath = await this.resolveOriginalFile(item);
    if (support.level === "converted") {
      const convertedPath = this.cache.convertedPath(item.id, item.cacheKey);
      if (!(await isUsableFile(convertedPath))) {
        await mkdir(path.dirname(convertedPath), { recursive: true });
        await sharp(originalPath, { limitInputPixels: false }).rotate().png().toFile(convertedPath);
      }
      return { path: convertedPath, mimeType: "image/png" };
    }

    return { path: originalPath, mimeType: support.mimeType };
  }

  async resolveThumbnailFile(item: InternalLibraryItem): Promise<ResolvedImageFile> {
    const thumbnailPath = this.cache.thumbnailPath(item.id, item.cacheKey);
    const existing = await isUsableFile(thumbnailPath);
    if (existing) {
      return { path: thumbnailPath, mimeType: "image/webp" };
    }

    const inFlight = this.inFlightThumbnails.get(thumbnailPath);
    if (inFlight) return inFlight;

    const promise = this.createThumbnail(item, thumbnailPath).finally(() => {
      this.inFlightThumbnails.delete(thumbnailPath);
    });
    this.inFlightThumbnails.set(thumbnailPath, promise);
    return promise;
  }

  async readMetadata(item: InternalLibraryItem): Promise<ImageMetadata> {
    const cached = this.metadataCache.get(`${item.id}:${item.cacheKey}`);
    if (cached) return cached;

    const originalPath = await this.resolveOriginalFile(item);
    const data = await runWorker<MetadataWorkerRequest, ImageMetadata>(electronWorkerPath("metadataWorker.cjs"), {
      inputPath: originalPath
    });
    this.metadataCache.set(`${item.id}:${item.cacheKey}`, data);
    return data;
  }

  private async createThumbnail(item: InternalLibraryItem, thumbnailPath: string): Promise<ResolvedImageFile> {
    const originalPath = await this.resolveOriginalFile(item);
    await runWorker<ThumbnailWorkerRequest, void>(electronWorkerPath("thumbnailWorker.cjs"), {
      inputPath: originalPath,
      outputPath: thumbnailPath,
      size: 220
    });
    return { path: thumbnailPath, mimeType: "image/webp" };
  }

  private async resolveOriginalFile(item: InternalLibraryItem): Promise<string> {
    if (item.originalPath) {
      return item.originalPath;
    }
    if (!item.archive) {
      throw new Error("Item has no source path.");
    }

    const extractedPath = this.cache.archiveEntryPath(item.id, item.cacheKey, item.extension);
    await extractZipEntry(item.archive.archivePath, item.archive.entryName, extractedPath, this.cache.archiveRoot);
    return extractedPath;
  }
}

async function isUsableFile(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}
