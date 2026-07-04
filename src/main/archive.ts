import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import * as yauzl from "yauzl";
import { getImageSupport, sortImageNames } from "../shared/formats";
import { ensureInside, normalizeArchiveEntryName } from "./pathValidation";

export interface ArchiveImageEntry {
  name: string;
  normalizedName: string;
  sizeBytes?: number;
  modifiedAt?: string;
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("Unable to open ZIP archive."));
        return;
      }
      resolve(zipFile);
    });
  });
}

export async function listZipImageEntries(zipPath: string): Promise<ArchiveImageEntry[]> {
  const zipFile = await openZip(zipPath);
  const entries: ArchiveImageEntry[] = [];

  return new Promise((resolve, reject) => {
    zipFile.on("entry", (entry: yauzl.Entry) => {
      try {
        const normalizedName = normalizeArchiveEntryName(entry.fileName);
        if (!entry.fileName.endsWith("/") && getImageSupport(normalizedName)) {
          entries.push({
            name: path.posix.basename(normalizedName),
            normalizedName,
            sizeBytes: entry.uncompressedSize,
            modifiedAt: entry.getLastModDate()?.toISOString()
          });
        }
      } catch {
        // Unsafe entries are ignored. Extraction also validates the chosen entry.
      }
      zipFile.readEntry();
    });

    zipFile.on("end", () => resolve(sortImageNames(entries)));
    zipFile.on("error", reject);
    zipFile.readEntry();
  });
}

export async function extractZipEntry(zipPath: string, entryName: string, targetPath: string, cacheRoot: string): Promise<void> {
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

    zipFile.on("entry", (entry: yauzl.Entry) => {
      let normalizedName: string;
      try {
        normalizedName = normalizeArchiveEntryName(entry.fileName);
      } catch {
        zipFile.readEntry();
        return;
      }

      if (normalizedName !== normalizedRequestedName) {
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
