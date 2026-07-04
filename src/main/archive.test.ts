import { describe, expect, it } from "vitest";
import { isArchiveEntryPathSafe, normalizeArchiveEntryName } from "./pathValidation";

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
  });
});
