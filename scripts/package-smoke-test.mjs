import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import * as yauzl from "yauzl";

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
  `resources/${manualQcFile}`,
  `resources/${releaseNotesFile}`,
  "resources/icon.ico",
  "resources/icon.png"
];

const forbiddenReleaseFilePatterns = [
  /private/i,
  /revocation/i,
  /passphrase/i,
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
  return zipEntries.some((entry) => entry.endsWith("/resources/app.asar") || entry === "resources/app.asar");
}

function assertZipResources(zipEntries, platform, zipName) {
  for (const resource of requiredPackagedResources) {
    const found = zipEntries.some((entry) => entry.endsWith(`/${resource}`) || entry === resource);
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

async function checkLinuxReleaseArtifacts(buildMtime) {
  const releaseDir = path.join(root, "release");
  if (!(await exists(releaseDir))) {
    return;
  }

  const expectedFiles = [
    `SuwolView-${packageVersion}-linux-x64.AppImage`,
    `SuwolView-${packageVersion}-linux-x64.tar.gz`,
    "latest-linux.yml"
  ];

  let foundAny = false;
  const missingExpectedFiles = [];
  for (const fileName of expectedFiles) {
    const fullPath = path.join(releaseDir, fileName);
    if (!(await exists(fullPath))) {
      missingExpectedFiles.push(fileName);
      continue;
    }
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
    (entry) => entry.isFile() && /^SuwolView-.+-linux-x64\.(?:AppImage|tar\.gz|deb|rpm)$/i.test(entry.name)
  );
  if (hasLinuxArtifact && (!foundAny || missingExpectedFiles.length > 0)) {
    failures.push(`Linux release build missing required files: ${missingExpectedFiles.join(", ")}`);
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
