import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listZipImageEntries } from "./archive";
import type { DecoderLayer } from "./decoder";
import { getImageSupport, isArchive, isSupportedImage, normalizeExtension, sortImageNames } from "../shared/formats";
import type { AppResult, ImageMetadata, LibraryItem, LibrarySource, OpenLibraryResult, SourceKind } from "../shared/types";
import { stableHash } from "./hash";
import type { InternalLibraryItem, ResolvedImageFile } from "./libraryTypes";

interface CurrentLibrary {
  source: LibrarySource;
  items: InternalLibraryItem[];
  itemMap: Map<string, InternalLibraryItem>;
}

const FILE_ITEM_CONCURRENCY = 32;

function imageProtocolUrl(kind: "display" | "thumbnail", itemId: string, cacheKey: string): string {
  return `suwol-image://${kind}/${encodeURIComponent(itemId)}?v=${encodeURIComponent(cacheKey)}`;
}

function sourceId(kind: SourceKind, sourcePath: string): string {
  return stableHash(`${kind}:${path.resolve(sourcePath)}`);
}

function itemCacheKey(parts: string[]): string {
  return stableHash(parts.join(":"));
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index], index);
      }
    })
  );

  return results;
}

export class LibraryManager {
  private current?: CurrentLibrary;

  constructor(private readonly decoder: DecoderLayer) {}

  async openPath(source: LibrarySource): Promise<OpenLibraryResult> {
    if (source.kind === "folder") return this.openFolder(source.path);
    if (source.kind === "archive") return this.openArchive(source.path);
    return this.openFile(source.path);
  }

  async openFile(filePath: string): Promise<OpenLibraryResult> {
    const resolvedPath = path.resolve(filePath);
    if (isArchive(resolvedPath)) {
      return this.openArchive(resolvedPath);
    }
    if (!isSupportedImage(resolvedPath)) {
      throw new Error("Selected file is not a supported image or archive.");
    }

    const folderPath = path.dirname(resolvedPath);
    return this.openFolder(folderPath, resolvedPath, "file");
  }

  async openFiles(filePaths: string[]): Promise<OpenLibraryResult> {
    const resolvedPaths = [...new Set(filePaths.map((filePath) => path.resolve(filePath)))];
    const imagePaths: string[] = [];
    for (const filePath of resolvedPaths) {
      const fileStats = await stat(filePath);
      if (fileStats.isFile() && isSupportedImage(filePath)) {
        imagePaths.push(filePath);
      }
    }

    if (imagePaths.length === 0) {
      throw new Error("No supported images were found.");
    }

    const source: LibrarySource = {
      id: stableHash(`files:${imagePaths.join("\0")}`),
      kind: "file",
      name: imagePaths.length === 1 ? path.basename(imagePaths[0]) : `${imagePaths.length} dropped files`,
      path: imagePaths[0],
      openedAt: new Date().toISOString()
    };
    const items = await mapConcurrent(imagePaths, FILE_ITEM_CONCURRENCY, async (filePath, index) =>
      this.createFileItem(source, filePath, index)
    );
    return this.setCurrent(source, items, 0);
  }

  async openFolder(folderPath: string, selectedFilePath?: string, sourceKind: SourceKind = "folder"): Promise<OpenLibraryResult> {
    const resolvedFolderPath = path.resolve(folderPath);
    const entries = await readdir(resolvedFolderPath, { withFileTypes: true });
    const imagePaths = sortImageNames(
      entries
        .filter((entry) => entry.isFile() && isSupportedImage(entry.name))
        .map((entry) => ({
          name: entry.name,
          fullPath: path.join(resolvedFolderPath, entry.name)
        }))
    );

    if (imagePaths.length === 0) {
      throw new Error("No supported images were found.");
    }

    const sourcePath = sourceKind === "file" && selectedFilePath ? selectedFilePath : resolvedFolderPath;
    const source = this.createSource(sourceKind, sourcePath);
    const items = await mapConcurrent(
      imagePaths,
      FILE_ITEM_CONCURRENCY,
      async (entry, index) => this.createFileItem(source, entry.fullPath, index)
    );
    const selectedIndex = selectedFilePath
      ? Math.max(0, items.findIndex((item) => item.originalPath === path.resolve(selectedFilePath)))
      : 0;

    return this.setCurrent(source, items, selectedIndex < 0 ? 0 : selectedIndex);
  }

  async openArchive(archivePath: string): Promise<OpenLibraryResult> {
    const resolvedArchivePath = path.resolve(archivePath);
    const archiveStats = await stat(resolvedArchivePath);
    if (!archiveStats.isFile() || !isArchive(resolvedArchivePath)) {
      throw new Error("Selected file is not a supported archive.");
    }

    const entries = await listZipImageEntries(resolvedArchivePath);
    if (entries.length === 0) {
      throw new Error("No supported images were found in the archive.");
    }

    const source = this.createSource("archive", resolvedArchivePath);
    const archiveCacheKey = itemCacheKey([String(archiveStats.mtimeMs), String(archiveStats.size)]);
    const items: InternalLibraryItem[] = entries.map((entry, index) => {
      const support = getImageSupport(entry.normalizedName);
      if (!support) {
        throw new Error(`Unsupported archive entry: ${entry.normalizedName}`);
      }
      const id = stableHash(`archive:${resolvedArchivePath}:${entry.entryIndex}:${entry.normalizedName}`);
      const cacheKey = itemCacheKey([archiveCacheKey, String(entry.entryIndex), entry.normalizedName, String(entry.sizeBytes ?? 0)]);
      return {
        id,
        sourceId: source.id,
        sourceKind: source.kind,
        name: entry.name,
        extension: normalizeExtension(entry.normalizedName),
        index,
        sizeBytes: entry.sizeBytes,
        modifiedAt: entry.modifiedAt,
        support,
        displayUrl: imageProtocolUrl("display", id, cacheKey),
        thumbnailUrl: imageProtocolUrl("thumbnail", id, cacheKey),
        containerName: path.basename(resolvedArchivePath),
        cacheKey,
        archive: {
          archivePath: resolvedArchivePath,
          entryName: entry.normalizedName,
          entryIndex: entry.entryIndex
        }
      };
    });

    return this.setCurrent(source, items, 0);
  }

  async resolveDisplayFile(itemId: string): Promise<ResolvedImageFile> {
    return this.decoder.resolveDisplayFile(this.getItem(itemId));
  }

  async resolveThumbnailFile(itemId: string): Promise<ResolvedImageFile> {
    return this.decoder.resolveThumbnailFile(this.getItem(itemId));
  }

  async readMetadata(itemId: string): Promise<AppResult<ImageMetadata>> {
    return this.decoder.readMetadata(this.getItem(itemId));
  }

  clearMetadataFailureCache(): void {
    this.decoder.clearMetadataFailureCache();
  }

  hasCurrentItem(itemId: string): boolean {
    return this.current?.itemMap.has(itemId) ?? false;
  }

  private createSource(kind: SourceKind, sourcePath: string): LibrarySource {
    return {
      id: sourceId(kind, sourcePath),
      kind,
      name: path.basename(sourcePath) || sourcePath,
      path: sourcePath,
      openedAt: new Date().toISOString()
    };
  }

  private async createFileItem(source: LibrarySource, filePath: string, index: number): Promise<InternalLibraryItem> {
    const resolvedPath = path.resolve(filePath);
    const fileStats = await stat(resolvedPath);
    const support = getImageSupport(resolvedPath);
    if (!support) {
      throw new Error(`Unsupported file: ${resolvedPath}`);
    }

    const id = stableHash(`file:${resolvedPath}`);
    const cacheKey = itemCacheKey([String(fileStats.mtimeMs), String(fileStats.size)]);
    return {
      id,
      sourceId: source.id,
      sourceKind: source.kind,
      name: path.basename(resolvedPath),
      extension: normalizeExtension(resolvedPath),
      index,
      sizeBytes: fileStats.size,
      modifiedAt: fileStats.mtime.toISOString(),
      support,
      displayUrl: imageProtocolUrl("display", id, cacheKey),
      thumbnailUrl: imageProtocolUrl("thumbnail", id, cacheKey),
      cacheKey,
      originalPath: resolvedPath
    };
  }

  private setCurrent(source: LibrarySource, items: InternalLibraryItem[], selectedIndex: number): OpenLibraryResult {
    this.current = {
      source,
      items,
      itemMap: new Map(items.map((item) => [item.id, item]))
    };
    return {
      source,
      items: items.map((item) => this.publicItem(item)),
      selectedIndex,
      recent: []
    };
  }

  private publicItem(item: InternalLibraryItem): LibraryItem {
    return {
      id: item.id,
      sourceId: item.sourceId,
      sourceKind: item.sourceKind,
      name: item.name,
      extension: item.extension,
      index: item.index,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      width: item.width,
      height: item.height,
      support: item.support,
      displayUrl: item.displayUrl,
      thumbnailUrl: item.thumbnailUrl,
      containerName: item.containerName
    };
  }

  private getItem(itemId: string): InternalLibraryItem {
    const item = this.current?.itemMap.get(itemId);
    if (!item) {
      throw new Error("Image item is no longer available.");
    }
    return item;
  }
}

export function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).toString();
}
