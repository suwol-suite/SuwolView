import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("empty viewer state", () => {
  it("shows only the app mark and name without mouse-edge hint text", async () => {
    const source = await readFile("src/renderer/App.tsx", "utf8");
    const start = source.indexOf('className="empty-state"');
    const end = source.indexOf("</div>", start);
    const emptyState = source.slice(start, end);

    expect(emptyState).toContain("<ImageIcon");
    expect(emptyState).toContain('t("viewer.emptyTitle")');
    expect(emptyState).not.toContain("empty-hint");
    expect(emptyState).not.toContain("topBarAutoHint");
    expect(emptyState).not.toContain("bottomBarAutoHint");
  });
});
