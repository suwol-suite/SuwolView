import iconv from "iconv-lite";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import * as yauzl from "yauzl";
import { getImageSupport } from "../shared/formats";
import type { ArchiveFolderNode } from "../shared/types";
import { ensureInside, normalizeArchiveEntryName } from "./pathValidation";

export interface ArchiveImageEntry {
  id: string;
  archiveEntryIndex: number;
  rawPath: string;
  normalizedPath: string;
  displayPath: string;
  fileName: string;
  parentPath: string;
  pathSegments: string[];
  extension: string;
  sizeBytes?: number;
  modifiedAt?: string;
}

export interface ArchiveIndex {
  entries: ArchiveImageEntry[];
  folders: ArchiveFolderNode[];
  commonRootPath?: string;
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true, decodeStrings: false }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("Unable to open ZIP archive."));
        return;
      }
      resolve(zipFile);
    });
  });
}

export function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function strictUtf8(buffer: Buffer): string | undefined {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return decoded.includes("\uFFFD") ? undefined : decoded;
  } catch {
    return undefined;
  }
}

function rawFileName(entry: yauzl.Entry): Buffer {
  const raw = entry.fileNameRaw;
  return Buffer.isBuffer(raw) ? raw : Buffer.from(entry.fileName as unknown as string, "utf8");
}

function unicodePathExtraField(rawName: Buffer, extraFields: yauzl.ExtraField[]): string | undefined {
  const field = extraFields.find((candidate) => candidate.id === 0x7075);
  if (!field || field.data.length < 6 || field.data[0] !== 1) return undefined;
  if (field.data.readUInt32LE(1) !== crc32(rawName)) return undefined;
  return strictUtf8(field.data.subarray(5));
}

function candidateScore(value: string, rawName: Buffer): number {
  const replacementCount = [...value].filter((char) => char === "\uFFFD").length;
  const controlCount = [...value].filter((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  }).length;
  const boxCount = [...value].filter((char) => "┐└├┤┬┴┼▒░▓╬".includes(char)).length;
  const hangulCount = [...value].filter((char) => /[\uAC00-\uD7A3]/u.test(char)).length;
  const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(value) ? 1 : 0;
  const hasPathStructure = value.length > 0 && !value.startsWith("/") && !value.includes("\\") ? 1 : 0;
  const asciiRaw = rawName.every((byte) => byte < 0x80);
  return (
    -replacementCount * 30 -
    controlCount * 12 -
    boxCount * 6 +
    hangulCount * 6 +
    hasExtension * 3 +
    hasPathStructure * 2 +
    (asciiRaw && value === rawName.toString("ascii") ? 8 : 0)
  );
}

/** Decode a ZIP Central Directory filename without first turning its bytes into a lossy string. */
export function decodeZipEntryName(rawName: Buffer, generalPurposeBitFlag: number, extraFields: yauzl.ExtraField[]): string {
  const unicodeName = unicodePathExtraField(rawName, extraFields);
  if (unicodeName) return unicodeName;

  const utf8Flag = (generalPurposeBitFlag & 0x800) !== 0;
  const candidates = new Map<string, number>();
  const addCandidate = (value: string | undefined) => {
    if (value && !value.includes("\uFFFD")) candidates.set(value, candidateScore(value, rawName));
  };

  if (utf8Flag) {
    addCandidate(strictUtf8(rawName));
  } else {
    addCandidate(strictUtf8(rawName));
    addCandidate(iconv.decode(rawName, "cp949"));
    addCandidate(iconv.decode(rawName, "cp437"));
  }

  if (candidates.size === 0) return iconv.decode(rawName, utf8Flag ? "utf8" : "cp437");
  return [...candidates.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

function decodedEntryName(entry: yauzl.Entry): string {
  return decodeZipEntryName(rawFileName(entry), entry.generalPurposeBitFlag, entry.extraFields);
}

function isArchiveMetadataPath(normalizedPath: string): boolean {
  const segments = normalizedPath.split("/");
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const fileName = lowerSegments.at(-1) ?? "";
  return lowerSegments.includes("__macosx")
    || fileName === ".ds_store"
    || fileName === "thumbs.db"
    || fileName === "desktop.ini"
    || fileName.startsWith("._");
}

function pathSegments(normalizedPath: string): string[] {
  return normalizedPath.split("/").filter(Boolean);
}

function commonRootPath(entries: readonly ArchiveImageEntry[]): string | undefined {
  const roots = new Set(entries.map((entry) => entry.pathSegments[0]).filter(Boolean));
  if (roots.size !== 1 || entries.some((entry) => entry.pathSegments.length < 2)) return undefined;
  const root = [...roots][0];
  if (entries.some((entry) => entry.parentPath === root)) return undefined;
  return root;
}

function createFolderTree(entries: readonly ArchiveImageEntry[], directoryPaths: readonly string[], commonRoot?: string): ArchiveFolderNode[] {
  const folderPaths = new Set<string>(directoryPaths.filter(Boolean));
  for (const entry of entries) {
    for (let index = 1; index < entry.pathSegments.length; index += 1) {
      folderPaths.add(entry.pathSegments.slice(0, index).join("/"));
    }
  }

  const nodes = new Map<string, ArchiveFolderNode>();
  for (const fullPath of [...folderPaths].sort((left, right) => {
    const leftDepth = pathSegments(left).length;
    const rightDepth = pathSegments(right).length;
    return leftDepth - rightDepth || left.localeCompare(right, "en-US", { sensitivity: "base" });
  })) {
    const segments = pathSegments(fullPath);
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join("/") : null;
    nodes.set(fullPath, {
      id: `folder:${fullPath}`,
      name: segments.at(-1) ?? fullPath,
      fullPath,
      parentPath,
      childFolders: [],
      imageEntryIds: [],
      descendantImageCount: 0
    });
  }

  for (const entry of entries) {
    const folder = nodes.get(entry.parentPath);
    if (folder) folder.imageEntryIds.push(entry.id);
  }

  for (const node of nodes.values()) {
    if (node.parentPath) nodes.get(node.parentPath)?.childFolders.push(node);
  }

  const countDescendants = (node: ArchiveFolderNode): number => {
    node.childFolders.sort((left, right) => left.name.localeCompare(right.name, "en-US", { numeric: true, sensitivity: "base" }));
    node.descendantImageCount = node.imageEntryIds.length + node.childFolders.reduce((sum, child) => sum + countDescendants(child), 0);
    return node.descendantImageCount;
  };
  for (const node of nodes.values()) {
    if (node.parentPath === null) countDescendants(node);
  }

  const roots = [...nodes.values()].filter((node) => {
    if (!commonRoot) return node.parentPath === null;
    if (node.fullPath === commonRoot) return false;
    return node.parentPath === commonRoot || !node.fullPath.startsWith(`${commonRoot}/`);
  });
  return roots.sort((left, right) => left.name.localeCompare(right.name, "en-US", { numeric: true, sensitivity: "base" }));
}

export async function listZipImageIndex(zipPath: string): Promise<ArchiveIndex> {
  const zipFile = await openZip(zipPath);
  const entries: ArchiveImageEntry[] = [];
  const directoryPaths: string[] = [];
  let entryIndex = 0;

  return new Promise((resolve, reject) => {
    zipFile.on("entry", (entry: yauzl.Entry) => {
      const currentEntryIndex = entryIndex;
      entryIndex += 1;
      try {
        const rawPath = decodedEntryName(entry);
        const isDirectory = /[\\/]$/.test(rawPath);
        const normalizedPath = normalizeArchiveEntryName(rawPath.replace(/[\\/]+$/, ""));
        if (isDirectory) {
          if (!isArchiveMetadataPath(normalizedPath)) directoryPaths.push(normalizedPath);
        } else if (!isArchiveMetadataPath(normalizedPath) && getImageSupport(normalizedPath) && entry.uncompressedSize > 0) {
          const segments = pathSegments(normalizedPath);
          const parentPath = segments.slice(0, -1).join("/");
          entries.push({
            id: `entry:${currentEntryIndex}:${normalizedPath}`,
            archiveEntryIndex: currentEntryIndex,
            rawPath,
            normalizedPath,
            displayPath: normalizedPath,
            fileName: segments.at(-1) ?? normalizedPath,
            parentPath,
            pathSegments: segments,
            extension: getImageSupport(normalizedPath)?.extension ?? "",
            sizeBytes: entry.uncompressedSize,
            modifiedAt: entry.getLastModDate()?.toISOString()
          });
        }
      } catch {
        // Unsafe entries are ignored. Extraction also validates the chosen entry.
      }
      zipFile.readEntry();
    });

    zipFile.on("end", () => {
      const sortedEntries = [...entries].sort((left, right) => {
        const segmentCount = Math.max(left.pathSegments.length, right.pathSegments.length);
        for (let index = 0; index < segmentCount; index += 1) {
          const result = (left.pathSegments[index] ?? "").localeCompare(right.pathSegments[index] ?? "", "en-US", {
            numeric: true,
            sensitivity: "base"
          });
          if (result !== 0) return result;
        }
        return left.normalizedPath.localeCompare(right.normalizedPath, "en-US", { sensitivity: "base" })
          || left.archiveEntryIndex - right.archiveEntryIndex;
      });
      const commonRoot = commonRootPath(sortedEntries);
      for (const entry of sortedEntries) {
        entry.displayPath = commonRoot && entry.normalizedPath.startsWith(`${commonRoot}/`)
          ? entry.normalizedPath.slice(commonRoot.length + 1)
          : entry.normalizedPath;
      }
      resolve({ entries: sortedEntries, folders: createFolderTree(sortedEntries, directoryPaths, commonRoot), commonRootPath: commonRoot });
    });
    zipFile.on("error", reject);
    zipFile.readEntry();
  });
}

export async function listZipImageEntries(zipPath: string): Promise<ArchiveImageEntry[]> {
  return (await listZipImageIndex(zipPath)).entries;
}

export async function extractZipEntry(
  zipPath: string,
  entryName: string,
  targetPath: string,
  cacheRoot: string,
  requestedEntryIndex?: number
): Promise<void> {
  const normalizedRequestedName = normalizeArchiveEntryName(entryName);
  const safeTargetPath = ensureInside(cacheRoot, targetPath);

  try {
    const current = await stat(safeTargetPath);
    if (current.isFile() && current.size > 0) return;
  } catch {
    await mkdir(path.dirname(safeTargetPath), { recursive: true });
  }

  const tempPath = `${safeTargetPath}.tmp`;
  await rm(tempPath, { force: true });
  const zipFile = await openZip(zipPath);

  await new Promise<void>((resolve, reject) => {
    let found = false;
    let entryIndex = 0;

    zipFile.on("entry", (entry: yauzl.Entry) => {
      const currentEntryIndex = entryIndex;
      entryIndex += 1;
      let normalizedName: string;
      try {
        normalizedName = normalizeArchiveEntryName(decodedEntryName(entry));
      } catch {
        zipFile.readEntry();
        return;
      }

      const matches = requestedEntryIndex === undefined
          ? normalizedName === normalizedRequestedName
          : currentEntryIndex === requestedEntryIndex && normalizedName === normalizedRequestedName;
      if (!matches) {
        zipFile.readEntry();
        return;
      }

      found = true;
      zipFile.openReadStream(entry, (error, readStream) => {
        if (error || !readStream) {
          reject(error ?? new Error("Unable to read archive entry."));
          return;
        }
        const writeStream = createWriteStream(tempPath);
        readStream.pipe(writeStream);
        readStream.on("error", reject);
        writeStream.on("error", reject);
        writeStream.on("finish", resolve);
      });
    });

    zipFile.on("end", () => {
      if (!found) reject(new Error(`Archive entry not found: ${entryName}`));
    });
    zipFile.on("error", reject);
    zipFile.readEntry();
  });

  await rm(safeTargetPath, { force: true });
  await rename(tempPath, safeTargetPath);
}
