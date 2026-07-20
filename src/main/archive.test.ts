import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import iconv from "iconv-lite";
import { crc32, decodeZipEntryName, listZipImageEntries, listZipImageIndex } from "./archive";
import { isArchiveEntryPathSafe, normalizeArchiveEntryName } from "./pathValidation";

interface ZipFixtureEntry {
  name: Buffer;
  flag?: number;
  extra?: Buffer;
  data?: Buffer;
}

function makeStoredZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = entry.data ?? Buffer.from("image");
    const flag = entry.flag ?? 0;
    const extra = entry.extra ?? Buffer.alloc(0);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flag, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(entry.name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    localParts.push(local, entry.name, extra, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flag, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(entry.name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(0, 42);
    centralParts.push(central, entry.name, extra);
    offset += local.length + entry.name.length + extra.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe("archive path validation", () => {
  it("accepts nested relative entry names", () => {
    expect(normalizeArchiveEntryName("chapter 1/page-001.jpg")).toBe("chapter 1/page-001.jpg");
    expect(normalizeArchiveEntryName("chapter\\page.png")).toBe("chapter/page.png");
  });

  it("rejects zip-slip style entries", () => {
    expect(isArchiveEntryPathSafe("../page.jpg")).toBe(false);
    expect(isArchiveEntryPathSafe("chapter/../../page.jpg")).toBe(false);
    expect(isArchiveEntryPathSafe("C:/temp/page.jpg")).toBe(false);
    expect(isArchiveEntryPathSafe("/tmp/page.jpg")).toBe(false);
    expect(isArchiveEntryPathSafe("\\\\server\\share\\page.jpg")).toBe(false);
    expect(isArchiveEntryPathSafe("image\0.png")).toBe(false);
  });

  it("decodes UTF-8 and CP949 names from raw bytes", () => {
    expect(decodeZipEntryName(Buffer.from("한글파일.png"), 0x800, [])).toBe("한글파일.png");
    expect(decodeZipEntryName(iconv.encode("만화/001화.png", "cp949"), 0, [])).toBe("만화/001화.png");
  });

  it("prefers a CRC-valid Unicode Path extra field", () => {
    const raw = iconv.encode("dummy.png", "cp949");
    const unicodeName = Buffer.from("한글파일.png");
    const extra = {
      id: 0x7075,
      data: Buffer.concat([Buffer.from([1]), Buffer.from(Uint32Array.of(crc32(raw)).buffer), unicodeName])
    };
    // ZIP extra-field CRCs are little-endian.
    extra.data.writeUInt32LE(crc32(raw), 1);
    expect(decodeZipEntryName(raw, 0, [extra])).toBe("한글파일.png");
  });

  it("lists CP949 and UTF-8 nested names from a lazy ZIP fixture", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-archive-"));
    try {
      const archivePath = path.join(tempDir, "fixture.cbz");
      await writeFile(
        archivePath,
        makeStoredZip([
          { name: iconv.encode("만화/001화.png", "cp949") },
          { name: Buffer.from("한글파일.png"), flag: 0x800 },
          { name: Buffer.from("../outside.png") }
        ])
      );
      await expect(listZipImageEntries(archivePath)).resolves.toEqual([
        expect.objectContaining({ rawPath: "만화/001화.png", normalizedPath: "만화/001화.png", displayPath: "만화/001화.png" }),
        expect.objectContaining({ rawPath: "한글파일.png", normalizedPath: "한글파일.png", displayPath: "한글파일.png" })
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("builds a recursive folder tree with natural ordering and a collapsed wrapper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-archive-"));
    try {
      const archivePath = path.join(tempDir, "nested.cbz");
      await writeFile(
        archivePath,
        makeStoredZip([
          { name: Buffer.from("Comic/Season 2/Episode 10/page-2.jpg") },
          { name: Buffer.from("Comic/Season 2/Episode 2/page-1.jpg") },
          { name: Buffer.from("Comic/Season 1/page-1.jpg") },
          { name: Buffer.from("Comic/Season 2/Episode 2/page-1.jpg") },
          { name: Buffer.from("Comic/__MACOSX/._page.jpg") },
          { name: Buffer.from("Comic/Thumbs.db") },
          { name: Buffer.from("../outside.jpg") }
        ])
      );

      const index = await listZipImageIndex(archivePath);
      expect(index.commonRootPath).toBe("Comic");
      expect(index.entries.map((entry) => entry.displayPath)).toEqual([
        "Season 1/page-1.jpg",
        "Season 2/Episode 2/page-1.jpg",
        "Season 2/Episode 2/page-1.jpg",
        "Season 2/Episode 10/page-2.jpg"
      ]);
      expect(new Set(index.entries.map((entry) => entry.id)).size).toBe(4);
      expect(index.folders.map((folder) => folder.fullPath)).toEqual(["Comic/Season 1", "Comic/Season 2"]);
      expect(index.folders[1].childFolders.map((folder) => folder.name)).toEqual(["Episode 2", "Episode 10"]);
      expect(index.folders[1].childFolders[0].descendantImageCount).toBe(2);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
