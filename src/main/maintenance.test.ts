import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CachePaths } from "./cache";
import { AppLogger } from "./logging";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-maintenance-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("maintenance utilities", () => {
  it("creates log files under the user data logs directory", async () => {
    const logger = new AppLogger(tempDir);
    await logger.write("main.log", "info", "test message", { source: "unit-test" });

    const data = await readFile(path.join(tempDir, "logs", "main.log"), "utf8");
    expect(data).toContain("test message");
    expect(data).toContain("unit-test");
  });

  it("clears only the thumbnail cache directory", async () => {
    const cache = new CachePaths(tempDir);
    await cache.ensure();
    await mkdir(cache.conversionRoot, { recursive: true });
    await writeFile(path.join(cache.thumbnailRoot, "thumb.webp"), "thumbnail", "utf8");
    await writeFile(path.join(cache.conversionRoot, "display.png"), "converted", "utf8");

    await cache.clearThumbnails();

    await expect(readFile(path.join(cache.thumbnailRoot, "thumb.webp"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(cache.conversionRoot, "display.png"), "utf8")).resolves.toBe("converted");
  });
});
