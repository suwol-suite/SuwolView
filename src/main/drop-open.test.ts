import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isUrlLikePath, normalizeDroppedPaths, resolveDropOpenTarget } from "./dropOpen";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suwol-drop-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("drop open", () => {
  it("rejects URL-like dropped values before path handling", () => {
    expect(isUrlLikePath("https://example.test/image.png")).toBe(true);
    expect(isUrlLikePath("file:///C:/tmp/image.png")).toBe(true);
    expect(isUrlLikePath("C:\\tmp\\image.png")).toBe(false);
    expect(normalizeDroppedPaths(["https://example.test/image.png"])).toEqual([]);
  });

  it("prefers the first dropped folder", async () => {
    const folder = path.join(tempDir, "images");
    await mkdir(folder);
    await writeFile(path.join(tempDir, "page.png"), "");

    await expect(resolveDropOpenTarget([folder, path.join(tempDir, "page.png")])).resolves.toEqual({
      type: "folder",
      path: folder
    });
  });

  it("classifies multiple dropped image files as a temporary image list", async () => {
    const first = path.join(tempDir, "first.png");
    const second = path.join(tempDir, "second.jpg");
    await writeFile(first, "");
    await writeFile(second, "");

    await expect(resolveDropOpenTarget([first, second])).resolves.toEqual({
      type: "images",
      paths: [first, second]
    });
  });

  it("classifies archives and unsupported files", async () => {
    const archive = path.join(tempDir, "book.cbz");
    const unsupported = path.join(tempDir, "notes.txt");
    await writeFile(archive, "");
    await writeFile(unsupported, "");

    await expect(resolveDropOpenTarget([archive])).resolves.toEqual({ type: "archive", path: archive });
    await expect(resolveDropOpenTarget([unsupported])).resolves.toEqual({ type: "unsupported" });
  });
});
