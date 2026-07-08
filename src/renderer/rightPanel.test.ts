import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readApp(): Promise<string> {
  return readFile("src/renderer/App.tsx", "utf8");
}

describe("right information panel", () => {
  it("contains current image metadata only", async () => {
    const source = await readApp();
    const start = source.indexOf('<aside className="info-panel side-panel-scroll">');
    const end = source.indexOf("</aside>", start);
    const infoPanel = source.slice(start, end);

    expect(infoPanel).toContain("<MetadataPanel");
    expect(infoPanel).toContain('t("common.noFile")');
    expect(infoPanel).not.toContain("PreferencesModal");
    expect(infoPanel).not.toContain("SettingsPanel");
    expect(infoPanel).not.toContain("settings.fileAssociations");
    expect(infoPanel).not.toContain("settings.maintenance");
    expect(infoPanel).not.toContain("settings.updates");
  });

  it("keeps settings sections in the preferences modal", async () => {
    const source = await readApp();

    expect(source).toContain("{preferencesOpen && (");
    expect(source).toContain("function PreferencesModal");
    expect(source).not.toContain("function SettingsPanel");
    expect(source).toContain('activeTab === "general"');
    expect(source).toContain('activeTab === "viewer"');
    expect(source).toContain('activeTab === "rendering"');
    expect(source).toContain('activeTab === "updates"');
    expect(source).toContain('activeTab === "fileAssociations"');
    expect(source).toContain('activeTab === "maintenance"');
    expect(source).toContain('activeTab === "about"');
  });
});
