import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("status bar side panel spacing", () => {
  it("adds bottom padding to scrollable side panels when the bottom bar is visible", async () => {
    const app = await readFile("src/renderer/App.tsx", "utf8");
    const styles = await readFile("src/renderer/styles.css", "utf8");

    expect(app).toContain('className="thumbnail-panel side-panel-scroll"');
    expect(app).toContain('className="info-panel side-panel-scroll"');
    expect(styles).toContain("--status-bar-height: 32px;");
    expect(styles).toContain(".app-shell.bottom-bar-visible .side-panel-scroll");
    expect(styles).toContain("padding-bottom: calc(var(--status-bar-height) + 16px);");
  });
});
