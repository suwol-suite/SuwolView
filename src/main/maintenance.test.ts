import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
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

  it("rotates oversized log files", async () => {
    const logger = new AppLogger(tempDir);
    await mkdir(path.join(tempDir, "logs"), { recursive: true });
    await writeFile(path.join(tempDir, "logs", "main.log"), Buffer.alloc(2 * 1024 * 1024, "x"));

    await logger.write("main.log", "info", "after rotation");

    await expect(readFile(path.join(tempDir, "logs", "main.log.1"), "utf8")).resolves.toContain("x");
    await expect(readFile(path.join(tempDir, "logs", "main.log"), "utf8")).resolves.toContain("after rotation");
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

  it("reports cache stats and cleans old thumbnail files", async () => {
    const cache = new CachePaths(tempDir);
    await cache.ensure();
    const oldThumb = path.join(cache.thumbnailRoot, "old.webp");
    const freshThumb = path.join(cache.thumbnailRoot, "fresh.webp");
    await writeFile(oldThumb, "old", "utf8");
    await writeFile(freshThumb, "fresh", "utf8");
    await utimes(oldThumb, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));

    const before = await cache.getStats();
    const cleanup = await cache.cleanupThumbnails(1000, Date.now());

    expect(before.thumbnailEntries).toBe(2);
    expect(cleanup.removedEntries).toBe(1);
    expect(cleanup.stats.thumbnailEntries).toBe(1);
    await expect(stat(oldThumb)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(freshThumb, "utf8")).resolves.toBe("fresh");
  });
});
