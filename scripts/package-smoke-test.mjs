import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import * as yauzl from "yauzl";

const root = process.cwd();

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
  "docs/release-notes-0.2.0.md",
  "assets/icon.svg",
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
  "resources/docs/release-notes-0.2.0.md"
];

const failures = [];
const notes = [];
let packageVersion = "";

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
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  packageVersion = typeof packageJson.version === "string" ? packageJson.version : "";
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
