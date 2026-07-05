import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { WINDOWS_FILE_ASSOCIATION_EXTENSIONS } from "../shared/fileAssociations";

describe("Windows file associations", () => {
  it("documents every stable association extension in electron-builder config", async () => {
    const builderConfig = await readFile("electron-builder.yml", "utf8");
    for (const extension of WINDOWS_FILE_ASSOCIATION_EXTENSIONS) {
      expect(builderConfig).toContain(`ext: ${extension}`);
    }
  });

  it("includes ZIP and NSIS Windows targets", async () => {
    const builderConfig = await readFile("electron-builder.yml", "utf8");
    expect(builderConfig).toContain("target: zip");
    expect(builderConfig).toContain("target: nsis");
    expect(builderConfig).toContain("include: build/installer.nsh");
    expect(builderConfig).toContain("oneClick: false");
  });

  it("registers Windows Open With application capabilities in the NSIS include", async () => {
    const installerInclude = await readFile("build/installer.nsh", "utf8");
    expect(installerInclude).toContain("Software\\RegisteredApplications");
    expect(installerInclude).toContain("Software\\Classes\\Applications\\SuwolView.exe\\SupportedTypes");
    expect(installerInclude).toContain("Software\\Classes\\Applications\\SuwolView.exe\\Capabilities\\FileAssociations");
    expect(installerInclude).toContain(".png");
    expect(installerInclude).toContain(".jpg");
    expect(installerInclude).toContain(".webp");
    expect(installerInclude).toContain(".cbz");
  });
});
