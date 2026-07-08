import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readApp(): Promise<string> {
  return readFile("src/renderer/App.tsx", "utf8");
}

describe("preferences modal", () => {
  it("prevents Tab from toggling the info panel while the modal is open", async () => {
    const source = await readApp();
    const start = source.indexOf("const handleKeyDown");
    const end = source.indexOf("window.addEventListener", start);
    const keyboardHandler = source.slice(start, end);
    const modalGuardIndex = keyboardHandler.indexOf("if (preferencesOpen)");
    const tabToggleIndex = keyboardHandler.indexOf('event.key === "Tab"');

    expect(modalGuardIndex).toBeGreaterThanOrEqual(0);
    expect(tabToggleIndex).toBeGreaterThan(modalGuardIndex);
    expect(keyboardHandler.slice(modalGuardIndex, tabToggleIndex)).toContain("return;");
  });

  it("closes preferences with Escape before fullscreen escape handling", async () => {
    const source = await readApp();
    const start = source.indexOf("const handleKeyDown");
    const end = source.indexOf("window.addEventListener", start);
    const keyboardHandler = source.slice(start, end);
    const modalEscapeIndex = keyboardHandler.indexOf('if (event.key === "Escape")');
    const fullscreenEscapeIndex = keyboardHandler.indexOf('event.key === "Escape" && fullscreen');

    expect(modalEscapeIndex).toBeGreaterThanOrEqual(0);
    expect(fullscreenEscapeIndex).toBeGreaterThan(modalEscapeIndex);
    expect(keyboardHandler.slice(modalEscapeIndex, fullscreenEscapeIndex)).toContain("setPreferencesOpen(false)");
  });

  it("hides developer update notes in packaged release UI", async () => {
    const source = await readApp();
    const updatesStart = source.indexOf('activeTab === "updates"');
    const fileAssociationsStart = source.indexOf('activeTab === "fileAssociations"', updatesStart);
    const updatesPanel = source.slice(updatesStart, fileAssociationsStart);

    expect(source).toContain("const showDeveloperUpdateNotes = runtimeInfo?.isPackaged === false;");
    expect(updatesPanel).toContain("showDeveloperUpdateNotes &&");
    expect(updatesPanel).toContain('t("settings.macSignedUpdateNote")');
    expect(updatesPanel).toContain('t("settings.appImageUpdateNote")');
    expect(updatesPanel).toContain('t("settings.portableUpdateNote")');
  });
});
