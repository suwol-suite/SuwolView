import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readApp(): Promise<string> {
  return readFile("src/renderer/App.tsx", "utf8");
}

async function readStyles(): Promise<string> {
  return readFile("src/renderer/styles.css", "utf8");
}

describe("top toolbar layout", () => {
  it("excludes language and theme controls from the toolbar", async () => {
    const source = await readApp();
    const start = source.indexOf("<header");
    const end = source.indexOf("</header>", start);
    const toolbar = source.slice(start, end);

    expect(toolbar).not.toContain("language-select");
    expect(toolbar).not.toContain('t("settings.language")');
    expect(toolbar).not.toContain('t("toolbar.theme")');
    expect(toolbar).not.toContain("onSetTheme");
  });

  it("includes a top toolbar pin button synced to topBarMode", async () => {
    const source = await readApp();

    expect(source).toContain("const toggleTopBarPin");
    expect(source).toContain('setTopBarMode((value) => (value === "always" ? "auto" : "always"))');
    expect(source).toContain('aria-pressed={topBarMode === "always"}');
    expect(source).toContain('title={t("settings.pinTopBar")}');
    expect(source).toContain('checked={topBarMode === "auto"}');
    expect(source).toContain("chromeModeForAutoHide(event.currentTarget.checked)");
  });

  it("keeps toolbar controls on one line and prevents label wrapping", async () => {
    const styles = await readStyles();

    expect(styles).toContain("flex-wrap: nowrap;");
    expect(styles).toContain("overflow: hidden;");
    expect(styles).toContain("white-space: nowrap;");
    expect(styles).toContain(".optional-label");
    expect(styles).toContain(".toolbar-more");
    expect(styles).not.toContain(".top-bar {\n    flex-wrap: wrap;");
    expect(styles).not.toContain(".top-bar {\n    height: auto;");
  });
});
