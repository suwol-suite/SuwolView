import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getImageSupport } from "../shared/formats";
import type { AppResult, ImageMetadata } from "../shared/types";
import { extractZipEntry } from "./archive";
import type { InternalLibraryItem, MetadataWorkerRequest, ResolvedImageFile, ThumbnailWorkerRequest } from "./libraryTypes";
import {
  classifyMetadataFailure,
  failedResult,
  MetadataFailureCache,
  metadataTooLargeFailure,
  METADATA_MAX_JSON_LENGTH,
  METADATA_MAX_TEXT_LENGTH,
  METADATA_TIMEOUT_MS,
  METADATA_WORKER_RESOURCE_LIMITS,
  shouldSkipMetadataBySize
} from "./metadataSafety";
import { electronWorkerPath, runWorker } from "./workerRunner";
import type { CachePaths } from "./cache";

class TaskQueue {
  private active = 0;
  private readonly pending: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const runTask = () => {
        this.active += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1;
            this.pending.shift()?.();
          });
      };

      if (this.active < this.concurrency) {
        runTask();
      } else {
        this.pending.push(runTask);
      }
    });
  }
}

export class DecoderLayer {
  private readonly metadataCache = new Map<string, ImageMetadata>();
  private readonly metadataFailureCache = new MetadataFailureCache();
  private readonly inFlightThumbnails = new Map<string, Promise<ResolvedImageFile>>();
  private readonly metadataQueue = new TaskQueue(1);
  private readonly thumbnailQueue = new TaskQueue(2);

  constructor(
    private readonly cache: CachePaths,
    private readonly options: { safeMode?: boolean } = {}
  ) {}

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

  async readMetadata(item: InternalLibraryItem): Promise<AppResult<ImageMetadata>> {
    if (this.options.safeMode) {
      return failedResult({
        code: "METADATA_SKIPPED_SAFE_MODE",
        messageKey: "errors.metadataSkippedSafeMode"
      });
    }

    const cacheKey = `${item.id}:${item.cacheKey}`;
    const cached = this.metadataCache.get(cacheKey);
    if (cached) return { ok: true, data: cached };

    const cachedFailure = this.metadataFailureCache.get(cacheKey);
    if (cachedFailure) return cachedFailure;

    if (shouldSkipMetadataBySize(item.sizeBytes)) {
      const failure = metadataTooLargeFailure(item.sizeBytes);
      this.metadataFailureCache.set(cacheKey, failure);
      return failedResult(failure);
    }

    try {
      const originalPath = await this.resolveOriginalFile(item);
      const originalStat = await stat(originalPath);
      if (shouldSkipMetadataBySize(originalStat.size)) {
        const failure = metadataTooLargeFailure(originalStat.size);
        this.metadataFailureCache.set(cacheKey, failure);
        return failedResult(failure);
      }

      const data = await this.metadataQueue.run(() =>
        runWorker<MetadataWorkerRequest, ImageMetadata>(
          electronWorkerPath("metadataWorker.cjs"),
          {
            inputPath: originalPath,
            maxTextLength: METADATA_MAX_TEXT_LENGTH,
            maxJsonLength: METADATA_MAX_JSON_LENGTH
          },
          {
            resourceLimits: METADATA_WORKER_RESOURCE_LIMITS,
            timeoutMs: METADATA_TIMEOUT_MS
          }
        )
      );
      this.metadataCache.set(cacheKey, data);
      return { ok: true, data };
    } catch (error) {
      const failure = classifyMetadataFailure(error);
      this.metadataFailureCache.set(cacheKey, failure);
      return failedResult(failure);
    }
  }

  clearMetadataFailureCache(): void {
    this.metadataFailureCache.clear();
  }

  private async createThumbnail(item: InternalLibraryItem, thumbnailPath: string): Promise<ResolvedImageFile> {
    const originalPath = await this.resolveOriginalFile(item);
    await this.thumbnailQueue.run(() =>
      runWorker<ThumbnailWorkerRequest, void>(electronWorkerPath("thumbnailWorker.cjs"), {
        inputPath: originalPath,
        outputPath: thumbnailPath,
        size: 220
      })
    );
    return { path: thumbnailPath, mimeType: "image/webp" };
  }

  private async resolveOriginalFile(item: InternalLibraryItem): Promise<string> {
    if (item.originalPath) {
      return item.originalPath;
    }
    if (!item.archiveFile) {
      throw new Error("Item has no source path.");
    }

    const extractedPath = this.cache.archiveEntryPath(item.id, item.cacheKey, item.extension);
    await extractZipEntry(item.archiveFile.archivePath, item.archiveFile.entryName, extractedPath, this.cache.archiveRoot, item.archiveFile.archiveEntryIndex);
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
