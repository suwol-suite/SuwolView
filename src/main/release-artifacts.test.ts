import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release artifact policy", () => {
  it("builds Linux AppImage and tar.gz artifacts with GitHub publish metadata", async () => {
    const builderConfig = await readFile("electron-builder.yml", "utf8");

    expect(builderConfig).toContain("provider: github");
    expect(builderConfig).toContain("owner: suwol-suite");
    expect(builderConfig).toContain("repo: SuwolView");
    expect(builderConfig).toContain("target: AppImage");
    expect(builderConfig).toContain("target: tar.gz");
  });

  it("collects Linux update metadata and public key for releases", async () => {
    const collectScript = await readFile("scripts/collect-release-artifact.mjs", "utf8");

    expect(collectScript).toContain("latest-linux.yml");
    expect(collectScript).toContain("suwol-release-public-key.asc");
    expect(collectScript).toContain("Missing required release metadata");
  });

  it("signs and uploads checksums from the release workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("GPG_PRIVATE_KEY_B64");
    expect(workflow).toContain("GPG_PASSPHRASE");
    expect(workflow).toContain("checksums.txt.asc");
    expect(workflow).toContain("gpg --verify checksums.txt.asc checksums.txt");
    expect(workflow).toContain("latest*.yml");
  });
});
