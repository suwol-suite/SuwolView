import { access, readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import * as yauzl from "yauzl";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const packageVersion = typeof packageJson.version === "string" ? packageJson.version : "";
const releaseNotesFile = `docs/release-notes-${packageVersion}.md`;
const manualQcFile = `docs/manual-qc-${packageVersion}.md`;

const requiredProjectFiles = [
  "dist/index.html",
  "dist-electron/main.cjs",
  "dist-electron/preload.cjs",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_LICENSES.md",
  "README.md",
  "docs/legal-policy.md",
  "docs/third-party-policy.md",
  "docs/lgpl-compliance.md",
  "docs/security-policy.md",
  manualQcFile,
  releaseNotesFile,
  "suwol-release-public-key.asc",
  "assets/icon-source.png",
  "assets/icon.ico",
  "assets/icon.png"
];

const requiredPackagedResources = [
  "resources/LICENSE",
  "resources/NOTICE",
  "resources/THIRD_PARTY_LICENSES.md",
  "resources/README.md",
  "resources/docs/legal-policy.md",
  "resources/docs/third-party-policy.md",
  "resources/docs/lgpl-compliance.md",
  "resources/docs/security-policy.md",
  "resources/app-update.yml",
  `resources/${manualQcFile}`,
  `resources/${releaseNotesFile}`,
  "resources/icon.ico",
  "resources/icon.png"
];

const forbiddenReleaseFilePatterns = [
  /private/i,
  /revocation/i,
  /passphrase/i,
  /app-specific/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.gpg$/i,
  /\.key$/i
];

const failures = [];
const notes = [];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

for (const file of requiredProjectFiles) {
  if (!(await exists(path.join(root, file)))) {
    failures.push(`Missing required file: ${file}`);
  }
}

try {
  if (!packageVersion) {
    failures.push("package.json version must be present.");
  }
  if (packageJson.license !== "Apache-2.0") {
    failures.push("package.json license must be Apache-2.0.");
  }
  if (packageJson.main !== "dist-electron/main.cjs") {
    failures.push("package.json main must point to dist-electron/main.cjs.");
  }
} catch (error) {
  failures.push(`Unable to read package.json: ${error instanceof Error ? error.message : String(error)}`);
}

async function outputMtime() {
  try {
    return (await stat(path.join(root, "dist-electron/main.cjs"))).mtimeMs;
  } catch {
    return 0;
  }
}

async function checkWinUnpacked(buildMtime) {
  const resourcesDir = path.join(root, "release", "win-unpacked", "resources");
  const executablePath = path.join(root, "release", "win-unpacked", "SuwolView.exe");
  if (!(await exists(resourcesDir))) {
    notes.push("No release/win-unpacked/resources directory found; unpacked package inspection skipped.");
    return;
  }

  const packageMtime = (await stat(resourcesDir)).mtimeMs;
  if (packageMtime < buildMtime) {
    notes.push("Existing win-unpacked package is older than the latest build; unpacked package inspection skipped.");
    return;
  }

  if (!(await exists(executablePath))) {
    failures.push("win-unpacked package missing: SuwolView.exe");
  }

  for (const resource of requiredPackagedResources) {
    const relative = resource.replace(/^resources\//, "");
    if (!(await exists(path.join(resourcesDir, relative)))) {
      failures.push(`Packaged resources missing: ${resource}`);
    }
  }
}

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error(`Unable to open ZIP: ${zipPath}`));
      } else {
        resolve(zipFile);
      }
    });
  });
}

async function listZipEntries(zipPath) {
  const zipFile = await openZip(zipPath);
  const entries = [];
  return new Promise((resolve, reject) => {
    zipFile.on("entry", (entry) => {
      entries.push(entry.fileName.replaceAll("\\", "/"));
      zipFile.readEntry();
    });
    zipFile.on("end", () => resolve(entries));
    zipFile.on("error", reject);
    zipFile.readEntry();
  });
}

function packagePlatform(fileName) {
  if (/win/i.test(fileName)) return "win";
  if (/mac|darwin/i.test(fileName)) return "mac";
  if (/linux|suwol-view/i.test(fileName)) return "linux";
  return "unknown";
}

function executableLooksPresent(zipEntries, platform) {
  if (platform === "win") {
    return zipEntries.some((entry) => /\/SuwolView\.exe$/i.test(entry) || /^SuwolView\.exe$/i.test(entry));
  }
  if (platform === "linux") {
    return zipEntries.some(
      (entry) =>
        /\/SuwolView$/i.test(entry) ||
        /\/suwol-view$/i.test(entry) ||
        /^SuwolView$/i.test(entry) ||
        /^suwol-view$/i.test(entry)
    );
  }
  if (platform === "mac") {
    return zipEntries.some(
      (entry) =>
        /\/SuwolView\.app\/Contents\/MacOS\/SuwolView$/i.test(entry) ||
        /^SuwolView\.app\/Contents\/MacOS\/SuwolView$/i.test(entry)
    );
  }
  return zipEntries.some((entry) => entry.endsWith("/resources/app.asar") || entry === "resources/app.asar");
}

function assertZipResources(zipEntries, platform, zipName) {
  for (const resource of requiredPackagedResources) {
    const macResource = resource.replace(/^resources\//, "Contents/Resources/");
    const found = zipEntries.some((entry) => {
      if (platform === "mac") {
        return entry.endsWith(`/SuwolView.app/${macResource}`) || entry === `SuwolView.app/${macResource}`;
      }
      return entry.endsWith(`/${resource}`) || entry === resource;
    });
    if (!found) {
      failures.push(`${zipName} missing: ${resource}`);
    }
  }

  if (!executableLooksPresent(zipEntries, platform)) {
    failures.push(`${zipName} does not contain an expected app executable entry.`);
  }
}

async function checkPackagedZips(buildMtime) {
  const releaseDir = path.join(root, "release");
  if (!(await exists(releaseDir))) {
    notes.push("No release directory found; packaged ZIP inspection skipped.");
    return;
  }

  const entries = await readdir(releaseDir, { withFileTypes: true });
  const zipFiles = [];
  for (const entry of entries) {
    if (entry.isFile() && /\.zip$/i.test(entry.name)) {
      const fullPath = path.join(releaseDir, entry.name);
      zipFiles.push({ fullPath, stats: await stat(fullPath) });
    }
  }

  if (zipFiles.length === 0) {
    notes.push("No packaged ZIP found; packaged ZIP inspection skipped.");
    return;
  }

  const freshZipFiles = zipFiles.filter((zipFile) => zipFile.stats.mtimeMs >= buildMtime);
  if (freshZipFiles.length === 0) {
    notes.push("Existing packaged ZIP files are older than the latest build; packaged ZIP inspection skipped.");
    return;
  }

  const platformGroups = new Map();
  for (const zipFile of freshZipFiles) {
    const name = path.basename(zipFile.fullPath);
    const platform = packagePlatform(name);
    const previous = platformGroups.get(platform);
    if (!previous || zipFile.stats.mtimeMs > previous.stats.mtimeMs) {
      platformGroups.set(platform, zipFile);
    }
  }

  for (const [platform, zipFile] of platformGroups) {
    const zipName = path.basename(zipFile.fullPath);
    if (!zipName.includes(packageVersion)) {
      failures.push(`${zipName} does not include package version ${packageVersion}.`);
    }
    if (zipFile.stats.size <= 0) {
      failures.push(`${zipName} is empty.`);
    }
    const zipEntries = await listZipEntries(zipFile.fullPath);
    assertZipResources(zipEntries, platform, zipName);
    notes.push(`Inspected ${platform} ZIP: ${path.relative(root, zipFile.fullPath)}`);
  }

  const freshWindowsZip = freshZipFiles.some((zipFile) => packagePlatform(path.basename(zipFile.fullPath)) === "win");
  if (freshWindowsZip) {
    await checkWindowsInstaller(buildMtime);
  }
}

async function assertNoForbiddenReleaseFiles(directoryPath) {
  if (!(await exists(directoryPath))) return;
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await assertNoForbiddenReleaseFiles(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (forbiddenReleaseFilePatterns.some((pattern) => pattern.test(entry.name))) {
      failures.push(`Forbidden release secret-like file found: ${path.relative(root, fullPath)}`);
    }
  }
}

async function firstExistingFile(directoryPath, fileNames) {
  for (const fileName of fileNames) {
    if (await exists(path.join(directoryPath, fileName))) {
      return fileName;
    }
  }
  return undefined;
}

async function firstMatchingFile(directoryPath, patterns) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const pattern of patterns) {
    const found = entries.find((entry) => entry.isFile() && pattern.test(entry.name));
    if (found) {
      return found.name;
    }
  }
  return undefined;
}

async function checkLinuxReleaseArtifacts(buildMtime) {
  const releaseDir = path.join(root, "release");
  if (!(await exists(releaseDir))) {
    return;
  }

  const expectedFiles = [
    [`SuwolView-${packageVersion}-linux-x64.AppImage`, `SuwolView-${packageVersion}-linux-x86_64.AppImage`],
    [`SuwolView-${packageVersion}-linux-x64.tar.gz`],
    ["latest-linux.yml"]
  ];

  let foundAny = false;
  const missingExpectedFiles = [];
  for (const fileNames of expectedFiles) {
    const resolvedFileName = await firstExistingFile(releaseDir, fileNames);
    if (!resolvedFileName) {
      missingExpectedFiles.push(fileNames.join(" or "));
      continue;
    }
    const fullPath = path.join(releaseDir, resolvedFileName);
    foundAny = true;
    const artifactStats = await stat(fullPath);
    if (artifactStats.mtimeMs < buildMtime) {
      failures.push(`Linux artifact is older than the latest build: ${path.relative(root, fullPath)}`);
    }
    if (artifactStats.size <= 0) {
      failures.push(`Linux artifact is empty: ${path.relative(root, fullPath)}`);
    }
    notes.push(`Inspected Linux artifact: ${path.relative(root, fullPath)}`);
  }

  const hasLinuxArtifact = (await readdir(releaseDir, { withFileTypes: true })).some(
    (entry) => entry.isFile() && /^SuwolView-.+-linux-x(?:64|86_64)\.(?:AppImage|tar\.gz|deb|rpm)$/i.test(entry.name)
  );
  if (hasLinuxArtifact && (!foundAny || missingExpectedFiles.length > 0)) {
    failures.push(`Linux release build missing required files: ${missingExpectedFiles.join(", ")}`);
  }
}

async function findAppBundles(directoryPath, depth = 0) {
  if (depth > 3 || !(await exists(directoryPath))) return [];
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const bundles = [];
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      bundles.push(fullPath);
      continue;
    }
    if (entry.isDirectory()) {
      bundles.push(...(await findAppBundles(fullPath, depth + 1)));
    }
  }
  return bundles;
}

async function findFilesByExtension(directoryPath, extensions, depth = 0) {
  if (depth > 12 || !(await exists(directoryPath))) return [];
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFilesByExtension(fullPath, extensions, depth + 1)));
      continue;
    }
    if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
      matches.push(fullPath);
    }
  }
  return matches;
}

async function checkCommand(command, args, label, options = {}) {
  const { required = true } = options;
  try {
    await execFileAsync(command, args, { cwd: root, timeout: 120000 });
    notes.push(`${label} passed.`);
  } catch (error) {
    const message = `${label} failed: ${error instanceof Error ? error.message : String(error)}`;
    if (required) {
      failures.push(message);
    } else {
      notes.push(`Warning: ${message}`);
    }
  }
}

async function checkMacSigningAndStapling(releaseDir, dmgFileName) {
  if (process.platform !== "darwin") {
    notes.push("macOS signing and notarization checks skipped on non-macOS host.");
    return;
  }

  try {
    const { stdout } = await execFileAsync("security", ["find-identity", "-v", "-p", "codesigning"], { cwd: root, timeout: 120000 });
    if (!stdout.includes("Developer ID Application")) {
      notes.push("Warning: no Developer ID Application identity found; unsigned macOS signing/stapling checks skipped.");
      return;
    }
  } catch (error) {
    notes.push(`Warning: unable to inspect macOS signing identities; unsigned signing/stapling checks skipped: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const appBundles = await findAppBundles(releaseDir);
  if (appBundles.length === 0) {
    failures.push("No macOS .app bundle found for codesign verification.");
  }
  for (const appBundle of appBundles) {
    await checkCommand("codesign", ["--verify", "--deep", "--verbose=4", appBundle], `codesign verify ${path.relative(root, appBundle)}`);
    await checkCommand("codesign", ["-dv", "--verbose=4", appBundle], `codesign details ${path.relative(root, appBundle)}`);
    const nativeFiles = await findFilesByExtension(appBundle, [".node", ".dylib"]);
    if (nativeFiles.length === 0) {
      notes.push(`No .node or .dylib files found for native codesign verification in ${path.relative(root, appBundle)}.`);
    }
    for (const nativeFile of nativeFiles) {
      await checkCommand("codesign", ["--verify", "--verbose=4", nativeFile], `codesign verify native ${path.relative(root, nativeFile)}`);
    }
    await checkCommand("spctl", ["-a", "-vvv", "-t", "execute", appBundle], `spctl execute ${path.relative(root, appBundle)}`, {
      required: false
    });
    await checkCommand("xcrun", ["stapler", "validate", appBundle], `stapler validate ${path.relative(root, appBundle)}`, {
      required: false
    });
  }

  if (dmgFileName) {
    await checkCommand("xcrun", ["stapler", "validate", path.join(releaseDir, dmgFileName)], `stapler validate release/${dmgFileName}`);
    await checkCommand(
      "spctl",
      ["-a", "-vvv", "-t", "open", "--context", "context:primary-signature", path.join(releaseDir, dmgFileName)],
      `spctl open release/${dmgFileName}`,
      { required: false }
    );
  }
}

async function checkMacReleaseArtifacts(buildMtime) {
  const releaseDir = path.join(root, "release");
  if (!(await exists(releaseDir))) {
    return;
  }

  const expectedFiles = [
    [/^SuwolView-.+-mac-arm64\.dmg$/i, /^SuwolView-.+-darwin-arm64\.dmg$/i],
    [/^SuwolView-.+-mac-arm64\.zip$/i, /^SuwolView-.+-darwin-arm64\.zip$/i],
    [/^latest-mac\.yml$/i]
  ];

  let foundAny = false;
  const missingExpectedFiles = [];
  let dmgFileName;
  for (const patterns of expectedFiles) {
    const resolvedFileName = await firstMatchingFile(releaseDir, patterns);
    if (!resolvedFileName) {
      missingExpectedFiles.push(patterns.map((pattern) => pattern.source).join(" or "));
      continue;
    }
    const fullPath = path.join(releaseDir, resolvedFileName);
    foundAny = true;
    if (/\.dmg$/i.test(resolvedFileName)) {
      dmgFileName = resolvedFileName;
    }
    const artifactStats = await stat(fullPath);
    if (artifactStats.mtimeMs < buildMtime) {
      failures.push(`macOS artifact is older than the latest build: ${path.relative(root, fullPath)}`);
    }
    if (artifactStats.size <= 0) {
      failures.push(`macOS artifact is empty: ${path.relative(root, fullPath)}`);
    }
    notes.push(`Inspected macOS artifact: ${path.relative(root, fullPath)}`);
  }

  const hasMacArtifact = (await readdir(releaseDir, { withFileTypes: true })).some(
    (entry) => entry.isFile() && /^SuwolView-.+-(?:mac|darwin)-arm64\.(?:dmg|zip)$/i.test(entry.name)
  );
  if (hasMacArtifact && (!foundAny || missingExpectedFiles.length > 0)) {
    failures.push(`macOS release build missing required files: ${missingExpectedFiles.join(", ")}`);
  }
  if (hasMacArtifact) {
    await checkMacSigningAndStapling(releaseDir, dmgFileName);
  }
}

async function checkWindowsInstaller(buildMtime) {
  const releaseDir = path.join(root, "release");
  const expectedInstaller = path.join(releaseDir, `SuwolView-${packageVersion}-setup.exe`);
  if (!(await exists(expectedInstaller))) {
    failures.push(`Missing Windows NSIS installer: release/SuwolView-${packageVersion}-setup.exe`);
    return;
  }

  const installerStats = await stat(expectedInstaller);
  if (installerStats.mtimeMs < buildMtime) {
    failures.push(`Windows NSIS installer is older than the latest build: ${path.relative(root, expectedInstaller)}`);
  }
  if (installerStats.size <= 0) {
    failures.push(`Windows NSIS installer is empty: ${path.relative(root, expectedInstaller)}`);
  }

  notes.push(`Inspected Windows NSIS installer: ${path.relative(root, expectedInstaller)}`);
}

const buildMtime = await outputMtime();
await checkWinUnpacked(buildMtime);
await checkPackagedZips(buildMtime);
await checkLinuxReleaseArtifacts(buildMtime);
await checkMacReleaseArtifacts(buildMtime);
await assertNoForbiddenReleaseFiles(path.join(root, "release"));
await assertNoForbiddenReleaseFiles(path.join(root, "release-artifacts"));

for (const note of notes) {
  console.log(note);
}

if (failures.length > 0) {
  console.error("Package smoke test failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Package smoke test passed.");
