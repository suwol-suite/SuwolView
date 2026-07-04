import { describe, expect, it } from "vitest";
import { getImageSupport, isArchive, sortImageNames } from "./formats";

describe("formats", () => {
  it("classifies native and converted image formats", () => {
    expect(getImageSupport("cover.JPG")?.level).toBe("native");
    expect(getImageSupport("page.tiff")?.level).toBe("converted");
    expect(getImageSupport("book.rar")).toBeUndefined();
  });

  it("recognizes initial archive containers", () => {
    expect(isArchive("comic.cbz")).toBe(true);
    expect(isArchive("pages.zip")).toBe(true);
    expect(isArchive("pages.7z")).toBe(false);
  });

  it("sorts names naturally", () => {
    expect(sortImageNames([{ name: "10.png" }, { name: "2.png" }, { name: "1.png" }])).toEqual([
      { name: "1.png" },
      { name: "2.png" },
      { name: "10.png" }
    ]);
  });
});
