import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("release artifact policy", () => {
  it("builds Linux AppImage and tar.gz artifacts with GitHub publish metadata", async () => {
    const builderConfig = await readFile("electron-builder.yml", "utf8");

    expect(builderConfig).toContain("provider: github");
    expect(builderConfig).toContain("owner: suwol-suite");
    expect(builderConfig).toContain("repo: SuwolView");
    expect(builderConfig).toContain("target: AppImage");
    expect(builderConfig).toContain("target: tar.gz");
    expect(builderConfig).toContain("target: dmg");
    expect(builderConfig).toContain("target: zip");
    expect(builderConfig).toContain("hardenedRuntime: true");
    expect(builderConfig).toContain("forceCodeSigning: true");
    expect(builderConfig).toContain("afterSign: scripts/resign-mac-app.mjs");
    expect(builderConfig).toContain("notarize: true");
    expect(builderConfig).toContain("entitlements.mac.plist");
    expect(builderConfig).toContain("arch:\n        - arm64");
    expect(builderConfig).not.toContain("universal");
  });

  it("collects Linux and macOS update metadata and public key for releases", async () => {
    const collectScript = await readFile("scripts/collect-release-artifact.mjs", "utf8");

    expect(collectScript).toContain("latest-linux.yml");
    expect(collectScript).toContain("latest-mac.yml");
    expect(collectScript).toContain("suwol-release-public-key.asc");
    expect(collectScript).toContain("Missing required release metadata");
    expect(collectScript).toContain("linux-x86_64.AppImage");
    expect(collectScript).toContain("darwin");
    expect(collectScript).toContain("mac-arm64");
    expect(collectScript).toContain("Expected mac-arm64 only");
  });

  it("smoke tests macOS release artifacts and signing checks when present", async () => {
    const smokeScript = await readFile("scripts/package-smoke-test.mjs", "utf8");

    expect(smokeScript).toContain("latest-mac\\.yml");
    expect(smokeScript).toContain("mac-arm64");
    expect(smokeScript).toContain("codesign");
    expect(smokeScript).toContain("--verbose=4");
    expect(smokeScript).not.toContain("--strict");
    expect(smokeScript).toContain(".node");
    expect(smokeScript).toContain(".dylib");
    expect(smokeScript).toContain("codesign verify native");
    expect(smokeScript).toContain("spctl");
    expect(smokeScript).toContain("stapler");
    expect(smokeScript).toContain("required: false");
    expect(smokeScript).toContain("context:primary-signature");
    expect(smokeScript).toContain("macOS signing and notarization checks skipped on non-macOS host");
  });

  it("notarizes and staples macOS DMG artifacts before release upload", async () => {
    const notarizeScript = await readFile("scripts/notarize-dmg.mjs", "utf8");
    const workflow = await readFile(".github/workflows/release.yml", "utf8");

    expect(notarizeScript).toContain("SuwolView-.+-mac-arm64\\.dmg");
    expect(notarizeScript).toContain("process.argv[2]");
    expect(notarizeScript).toContain("notarytool");
    expect(notarizeScript).toContain("submit");
    expect(notarizeScript).toContain("info");
    expect(notarizeScript).toContain("log");
    expect(notarizeScript).toContain("history");
    expect(notarizeScript).toContain("notary-submit.json");
    expect(notarizeScript).toContain("notary-info.json");
    expect(notarizeScript).toContain("notary-log.json");
    expect(notarizeScript).toContain("notary-history.json");
    expect(notarizeScript).toContain("--keychain-profile");
    expect(notarizeScript).toContain("suwol-notary-profile");
    expect(notarizeScript).toContain("NOTARYTOOL_PROFILE");
    expect(notarizeScript).toContain("POLL_INTERVAL_MS");
    expect(notarizeScript).toContain("TIMEOUT_MS");
    expect(notarizeScript).toContain("--output-format");
    expect(notarizeScript).toContain("json");
    expect(notarizeScript).toContain("formatNotaryFailure");
    expect(notarizeScript).toContain("stapler");
    expect(notarizeScript).toContain("staple");
    expect(notarizeScript).toContain("validate");
    expect(notarizeScript).not.toContain("APPLE_APP_SPECIFIC_PASSWORD");
    expect(notarizeScript).not.toContain("--password");
    expect(notarizeScript).not.toContain("--apple-id");
    expect(notarizeScript).not.toContain("--team-id");
    expect(notarizeScript).not.toContain("--wait");
    expect(workflow).toContain("Notarize macOS DMG");
    expect(workflow).toContain("node scripts/notarize-dmg.mjs");
  });

  it("uses keychain-profile arguments, polling status helpers, and redacted notary failures", async () => {
    const scriptUrl = pathToFileURL(path.join(process.cwd(), "scripts", "notarize-dmg.mjs")).href;
    const evalScript = `
      import {
        POLL_INTERVAL_MS,
        TIMEOUT_MS,
        formatNotaryFailure,
        infoArgs,
        isAcceptedNotaryStatus,
        isFailedNotaryStatus,
        isPendingNotaryStatus,
        logArgs,
        notarytoolProfile,
        redactSecrets,
        submitArgs
      } from ${JSON.stringify(scriptUrl)};

      const submit = { id: "abc-123", status: "Invalid", message: "Upload failed" };
      const log = {
        statusSummary: "Archive contains critical validation errors",
        issues: [
          {
            severity: "error",
            path: "SuwolView.app/Contents/MacOS/SuwolView",
            message: "The binary is not signed.",
            architecture: "arm64",
            docUrl: "https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution"
          }
        ]
      };

      console.log(JSON.stringify({
        accepted: isAcceptedNotaryStatus("Accepted"),
        failed: isFailedNotaryStatus("Rejected"),
        pending: isPendingNotaryStatus("In Progress"),
        profileDefault: notarytoolProfile({}),
        profileOverride: notarytoolProfile({ NOTARYTOOL_PROFILE: "custom-profile" }),
        pollInterval: POLL_INTERVAL_MS,
        timeout: TIMEOUT_MS,
        submitArgs: submitArgs("release/app.dmg", "profile-name"),
        infoArgs: infoArgs("abc-123", "profile-name"),
        logArgs: logArgs("abc-123", "profile-name"),
        redacted: redactSecrets("profile secret token", ["secret"]),
        summary: formatNotaryFailure(submit, log)
      }));
    `;

    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", evalScript], {
      cwd: process.cwd()
    });
    const parsed = JSON.parse(stdout);

    expect(parsed.accepted).toBe(true);
    expect(parsed.failed).toBe(true);
    expect(parsed.pending).toBe(true);
    expect(parsed.profileDefault).toBe("suwol-notary-profile");
    expect(parsed.profileOverride).toBe("custom-profile");
    expect(parsed.pollInterval).toBe(30000);
    expect(parsed.timeout).toBe(1800000);
    expect(parsed.submitArgs).toContain("--keychain-profile");
    expect(parsed.submitArgs).toContain("profile-name");
    expect(parsed.submitArgs).not.toContain("--password");
    expect(parsed.submitArgs).not.toContain("--apple-id");
    expect(parsed.submitArgs).not.toContain("--team-id");
    expect(parsed.infoArgs).toContain("info");
    expect(parsed.logArgs).toContain("log");
    expect(parsed.redacted).toBe("profile *** token");
    expect(parsed.summary).toContain("Notarization failed.");
    expect(parsed.summary).toContain("Submission ID: abc-123");
    expect(parsed.summary).toContain("Status: Invalid");
    expect(parsed.summary).toContain("Archive contains critical validation errors");
    expect(parsed.summary).toContain("severity: error");
    expect(parsed.summary).toContain("SuwolView.app/Contents/MacOS/SuwolView");
    expect(parsed.summary).toContain("The binary is not signed.");
    expect(parsed.summary).toContain("architecture: arm64");
    expect(parsed.summary).toContain("docUrl: https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution");
  });

  it("resigns macOS app internals with Developer ID runtime options before DMG notarization", async () => {
    const resignScript = await readFile("scripts/resign-mac-app.mjs", "utf8");

    expect(resignScript).toContain("Developer ID Application");
    expect(resignScript).toContain("security");
    expect(resignScript).toContain("find-identity");
    expect(resignScript).toContain("appPath");
    expect(resignScript).toContain("process.argv[2]");
    expect(resignScript).toContain("process.env.CI");
    expect(resignScript).toContain("Existing signature is valid; skipping resign");
    expect(resignScript).toContain("verifySignature");
    expect(resignScript).toContain("signPathIfNeeded");
    expect(resignScript).toContain("skipping final app resign");
    expect(resignScript).toContain("Contents\", \"Frameworks");
    expect(resignScript).toContain("app.asar.unpacked");
    expect(resignScript).toContain(".node");
    expect(resignScript).toContain(".dylib");
    expect(resignScript).toContain("--timestamp");
    expect(resignScript).toContain("--options");
    expect(resignScript).toContain("runtime");
    expect(resignScript).toContain("--entitlements");
    expect(resignScript).toContain("codesign");
    expect(resignScript).toContain("--verify");
    expect(resignScript).not.toContain("APPLE_APP_SPECIFIC_PASSWORD)");
  });

  it("provides a manual macOS signing diagnostics workflow without release uploads", async () => {
    const workflow = await readFile(".github/workflows/macos-build-diagnostics.yml", "utf8");

    expect(workflow).toContain("name: macOS Build Diagnostics");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("runs-on: [self-hosted, macOS, ARM64]");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("npx electron-builder --mac dir --arm64 --publish never");
    expect(workflow).toContain("NEED_RESIGN=false");
    expect(workflow).toContain("NEED_RESIGN=true");
    expect(workflow).toContain("Existing app signature is valid. Manual resign will be skipped.");
    expect(workflow).toContain("if: env.NEED_RESIGN == 'true'");
    expect(workflow).toContain("node scripts/resign-mac-app.mjs \"$APP_PATH\"");
    expect(workflow).toContain("npm run dist -- --mac dmg zip --arm64 --publish never");
    expect(workflow).toContain("node scripts/notarize-dmg.mjs \"$DMG_PATH\"");
    expect(workflow).toContain("xcrun stapler validate \"$DMG_PATH\"");
    expect(workflow).toContain("NOTARYTOOL_PROFILE: suwol-notary-profile");
    expect(workflow).not.toContain("APPLE_APP_SPECIFIC_PASSWORD");
    expect(workflow).toContain("diagnostics/*.json");
    expect(workflow).toContain("macos-build-diagnostics-0.2.4");
    expect(workflow).not.toContain("gh release");
    expect(workflow).not.toContain("Create GitHub Release");
  });

  it("signs and uploads checksums from the release workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("GPG_PRIVATE_KEY_B64");
    expect(workflow).toContain("GPG_PASSPHRASE");
    expect(workflow).toContain("runs-on: [self-hosted, macOS, ARM64]");
    expect(workflow).toContain("CSC_LINK");
    expect(workflow).toContain("CSC_KEY_PASSWORD");
    expect(workflow).toContain("APPLE_TEAM_ID");
    expect(workflow).toContain("NOTARYTOOL_PROFILE: suwol-notary-profile");
    expect(workflow).not.toContain("APPLE_APP_SPECIFIC_PASSWORD");
    expect(workflow).toContain("--mac dmg zip --arm64 --publish never");
    expect(workflow).toContain("checksums.txt.asc");
    expect(workflow).toContain("gpg --verify checksums.txt.asc checksums.txt");
    expect(workflow).toContain("SuwolView-*.dmg");
    expect(workflow).toContain("latest*.yml");
  });
});
