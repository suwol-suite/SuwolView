import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CachePaths } from "./cache";
import { DecoderLayer } from "./decoder";
import type { InternalLibraryItem } from "./libraryTypes";
import { extractLaunchPathArguments } from "./startupOpen";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-safe-mode-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("safe mode", () => {
  it("skips metadata extraction while keeping a structured result", async () => {
    const decoder = new DecoderLayer(new CachePaths(tempDir), { safeMode: true });
    const result = await decoder.readMetadata({
      id: "item",
      sourceId: "source",
      sourceKind: "file",
      name: "image.png",
      extension: "png",
      index: 0,
      support: {
        extension: "png",
        level: "native",
        label: "PNG",
        mimeType: "image/png"
      },
      displayUrl: "suwol-image://display/item?v=key",
      thumbnailUrl: "suwol-image://thumbnail/item?v=key",
      cacheKey: "key",
      originalPath: path.join(tempDir, "missing.png")
    } satisfies InternalLibraryItem);

    expect(result).toMatchObject({
      ok: false,
      code: "METADATA_SKIPPED_SAFE_MODE",
      messageKey: "errors.metadataSkippedSafeMode"
    });
  });

  it("does not treat the safe-mode flag itself as a launch path", () => {
    expect(
      extractLaunchPathArguments(["SuwolView.exe", "--safe-mode", "C:\\Images\\a.png"], {
        isPackaged: true
      })
    ).toEqual(["C:\\Images\\a.png"]);
  });
});
