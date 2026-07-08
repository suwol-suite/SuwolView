import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readApp(): Promise<string> {
  return readFile("src/renderer/App.tsx", "utf8");
}

async function readStyles(): Promise<string> {
  return readFile("src/renderer/styles.css", "utf8");
}

describe("top toolbar layout", () => {
  function toolbarSource(source: string): string {
    const start = source.indexOf("<header");
    const end = source.indexOf("</header>", start);
    return source.slice(start, end);
  }

  it("excludes language and theme controls from the toolbar", async () => {
    const toolbar = toolbarSource(await readApp());

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

  it("uses icon-only file, folder, and recent controls", async () => {
    const toolbar = toolbarSource(await readApp());
    const primaryStart = toolbar.indexOf('className="toolbar-group toolbar-primary"');
    const primaryEnd = toolbar.indexOf('className="toolbar-group toolbar-secondary"', primaryStart);
    const primaryToolbar = toolbar.slice(primaryStart, primaryEnd);

    expect(primaryToolbar).toContain("<FileImage");
    expect(primaryToolbar).toContain("<FolderOpen");
    expect(primaryToolbar).toContain("<History");
    expect(primaryToolbar).toContain('aria-label={t("toolbar.openFile")}');
    expect(primaryToolbar).toContain('aria-label={t("toolbar.openFolder")}');
    expect(primaryToolbar).toContain('aria-label={t("toolbar.recentItems")}');
    expect(primaryToolbar).not.toContain("button-label");
    expect(toolbar).not.toContain("<select");
  });

  it("places the zoom percentage between zoom out and zoom in", async () => {
    const toolbar = toolbarSource(await readApp());
    const zoomOut = toolbar.indexOf('title={t("toolbar.zoomOut")}');
    const zoomChip = toolbar.indexOf("zoom-chip zoom-chip-button");
    const zoomIn = toolbar.indexOf('title={t("toolbar.zoomIn")}');

    expect(zoomOut).toBeGreaterThanOrEqual(0);
    expect(zoomChip).toBeGreaterThan(zoomOut);
    expect(zoomIn).toBeGreaterThan(zoomChip);
    expect(toolbar).toContain('onClick={() => setViewMode("original")}');
  });

  it("keeps interpolation controls out of the top toolbar", async () => {
    const toolbar = toolbarSource(await readApp());

    expect(toolbar).not.toContain("viewModeOptions.map");
    expect(toolbar).not.toContain('t("viewer.interpolationFilter")');
    expect(toolbar).not.toContain('t("viewer.pixelMode")');
    expect(toolbar).not.toContain('setViewMode("fit-width")');
    expect(toolbar).not.toContain('setViewMode("webtoon")');
  });

  it("keeps display modes available from one top toolbar button", async () => {
    const source = await readApp();
    const toolbar = toolbarSource(source);

    expect(toolbar).toContain('aria-label={t("viewer.viewMode")}');
    expect(toolbar).toContain('toolbarMenu === "view"');
    expect(toolbar).toContain("<Monitor");
    expect(toolbar).not.toContain("<Maximize2");
    expect(source).toContain('toolbarMenu === "view" &&');
    expect(source).toContain("viewModeOptions.map");
    expect(source).toContain("setViewMode(value)");
  });

  it("enables small-image upscaling when a fit display mode is selected", async () => {
    const source = await readApp();

    expect(source).toContain('const nextUpscaleSmallImages = mode === "original" || mode === "webtoon" ? upscaleSmallImages : true;');
    expect(source).toContain("setUpscaleSmallImages(nextUpscaleSmallImages)");
    expect(source).toContain("calculateViewZoom(mode, displayedSize, 1, nextUpscaleSmallImages)");
  });

  it("keeps filter presets available from the top toolbar", async () => {
    const source = await readApp();
    const toolbar = toolbarSource(source);

    expect(toolbar).toContain('aria-label={t("viewer.filterPreset")}');
    expect(toolbar).toContain('toolbarMenu === "filter"');
    expect(source).toContain('toolbarMenu === "filter" &&');
    expect(source).toContain('className="toolbar-popover-title"');
    expect(source).toContain("filterPresetOptions.map");
    expect(source).toContain("setFilterPresetWithInterpolation");
    expect(source).toContain('none: "nearest"');
    expect(source).toContain('smooth: "bilinear"');
  });

  it("scales images with layout dimensions so pixelated rendering stays crisp", async () => {
    const source = await readApp();

    expect(source).not.toContain("scale(${zoom})");
    expect(source).toContain("Math.round(imageSize.width * zoom)");
    expect(source).toContain("Math.round(imageSize.height * zoom)");
    expect(source).toContain("style={mainImageStyle}");
    expect(source).toContain("style={twoPageImageStyle}");
    expect(source).toContain("const effectiveInterpolationFilter = interpolationForFilterPreset[filterPreset]");
  });

  it("keeps rotate and flip actions directly on the top toolbar", async () => {
    const toolbar = toolbarSource(await readApp());

    expect(toolbar).not.toContain('aria-label={t("toolbar.more")}');
    expect(toolbar).not.toContain("<MoreHorizontal");
    expect(toolbar).toContain('title={t("toolbar.rotateLeft90")}');
    expect(toolbar).toContain('title={t("toolbar.rotateRight90")}');
    expect(toolbar).toContain('title={t("toolbar.flipHorizontal")}');
    expect(toolbar).toContain('title={t("toolbar.flipVertical")}');
    expect(toolbar).toContain("<RotateCcw");
    expect(toolbar).toContain("<RotateCw");
    expect(toolbar).toContain("<FlipHorizontal");
    expect(toolbar).toContain("<FlipVertical");
  });

  it("keeps side panel toggles next to preferences", async () => {
    const toolbar = toolbarSource(await readApp());
    const flipVertical = toolbar.indexOf('title={t("toolbar.flipVertical")}');
    const thumbnails = toolbar.indexOf('title={t("toolbar.thumbnails")}');
    const info = toolbar.indexOf('title={t("toolbar.info")}');
    const preferences = toolbar.indexOf('title={t("settings.preferences")}');

    expect(thumbnails).toBeGreaterThan(flipVertical);
    expect(info).toBeGreaterThan(thumbnails);
    expect(preferences).toBeGreaterThan(info);
  });

  it("keeps toolbar controls on one line and prevents label wrapping", async () => {
    const styles = await readStyles();

    expect(styles).toContain("flex-wrap: nowrap;");
    expect(styles).toContain("overflow: hidden;");
    expect(styles).toContain("white-space: nowrap;");
    expect(styles).toContain(".optional-label");
    expect(styles).toContain(".toolbar-popover");
    expect(styles).toContain("max-height: calc(100vh - 78px);");
    expect(styles).toContain(".toolbar-secondary {\n  flex: 0 0 auto;\n  overflow: visible;");
    expect(styles).not.toContain(".top-bar {\n    flex-wrap: wrap;");
    expect(styles).not.toContain(".top-bar {\n    height: auto;");
    expect(styles).not.toContain(".top-bar {\n  position: absolute;\n  z-index: 20;\n  top: 0;\n  right: 0;\n  left: 0;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: nowrap;\n  gap: 12px;\n  height: 54px;\n  overflow: hidden;");
  });

  it("renders toolbar menus outside the transformed top bar", async () => {
    const source = await readApp();
    const toolbar = toolbarSource(source);

    expect(toolbar).not.toContain("<details");
    expect(source).toContain("toolbar-popover-backdrop");
    expect(source).toContain("toolbar-popover toolbar-popover-left");
    expect(source).toContain("toolbar-popover toolbar-popover-right");
  });
});
