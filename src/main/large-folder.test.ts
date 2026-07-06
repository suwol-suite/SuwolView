import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ImageMetadata } from "../shared/types";
import { LibraryManager } from "./library";
import type { ResolvedImageFile } from "./libraryTypes";

let tempDir: string;

class DecoderProbe {
  metadataReads = 0;
  thumbnailReads = 0;

  resolveDisplayFile(): Promise<ResolvedImageFile> {
    return Promise.resolve({ path: "", mimeType: "image/png" });
  }

  resolveThumbnailFile(): Promise<ResolvedImageFile> {
    this.thumbnailReads += 1;
    return Promise.resolve({ path: "", mimeType: "image/webp" });
  }

  readMetadata(): Promise<{ ok: true; data: ImageMetadata }> {
    this.metadataReads += 1;
    return Promise.resolve({ ok: true, data: { basic: {}, exif: {} } });
  }

  clearMetadataFailureCache(): void {
    // Probe method for LibraryManager compatibility.
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-large-folder-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("large folder listing", () => {
  it("creates the file list without reading metadata or thumbnails", async () => {
    for (let index = 0; index < 600; index += 1) {
      await writeFile(path.join(tempDir, `page-${String(index).padStart(4, "0")}.png`), "", "utf8");
    }
    const decoder = new DecoderProbe();
    const library = new LibraryManager(decoder as never);

    const result = await library.openFolder(tempDir);

    expect(result.items).toHaveLength(600);
    expect(decoder.metadataReads).toBe(0);
    expect(decoder.thumbnailReads).toBe(0);
  });
});
