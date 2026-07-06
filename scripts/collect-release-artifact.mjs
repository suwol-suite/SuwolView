import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const platform = process.argv[2];
if (platform !== "win" && platform !== "linux") {
  console.error("Usage: node scripts/collect-release-artifact.mjs <win|linux>");
  process.exit(1);
}

const root = process.cwd();
const releaseDir = path.join(root, "release");
const outputDir = path.join(root, "release-artifacts");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;

function artifactMatchesPlatform(name) {
  if (platform === "win") {
    return (
      name === `SuwolView-${version}-setup.exe` ||
      new RegExp(`^SuwolView-${escapeRegExp(version)}-win-x64\\.zip$`, "i").test(name)
    );
  }

  return new RegExp(
    `^SuwolView-${escapeRegExp(version)}-linux-x64\\.(?:AppImage|tar\\.gz|deb|rpm)$`,
    "i"
  ).test(name);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const entries = await readdir(releaseDir, { withFileTypes: true });
const candidates = [];
for (const entry of entries) {
  if (!entry.isFile() || !artifactMatchesPlatform(entry.name)) continue;
  const fullPath = path.join(releaseDir, entry.name);
  candidates.push({ fullPath, stats: await stat(fullPath) });
}

if (candidates.length === 0) {
  console.error(`No ${platform} release artifact found in release/.`);
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });

for (const candidate of candidates.sort((left, right) => left.fullPath.localeCompare(right.fullPath))) {
  const outputPath = path.join(outputDir, path.basename(candidate.fullPath));
  await copyFile(candidate.fullPath, outputPath);
  console.log(`Collected ${path.relative(root, outputPath)}.`);
}

const requiredLinuxExtensions = [".AppImage", ".tar.gz"];
if (platform === "linux") {
  for (const extension of requiredLinuxExtensions) {
    if (!candidates.some((candidate) => path.basename(candidate.fullPath).endsWith(extension))) {
      console.error(`Missing Linux ${extension} artifact in release/.`);
      process.exit(1);
    }
  }
}

if (platform === "win" && !candidates.some((candidate) => path.basename(candidate.fullPath) === `SuwolView-${version}-setup.exe`)) {
  console.error(`Missing Windows NSIS installer in release/.`);
  process.exit(1);
}

async function copyIfPresent(fileName, options = {}) {
  const sourcePath = path.join(releaseDir, fileName);
  const fileStats = await stat(sourcePath).catch(() => undefined);
  if (!fileStats?.isFile()) {
    if (options.required) {
      console.error(`Missing required release metadata: release/${fileName}.`);
      process.exit(1);
    }
    console.warn(`Release metadata not found, skipping: release/${fileName}.`);
    return;
  }

  const outputPath = path.join(outputDir, fileName);
  await copyFile(sourcePath, outputPath);
  console.log(`Collected ${path.relative(root, outputPath)}.`);
}

if (platform === "linux") {
  await copyIfPresent("latest-linux.yml", { required: true });
}

if (platform === "win") {
  await copyIfPresent("latest.yml", { required: false });
}

const publicKeyPath = path.join(root, "suwol-release-public-key.asc");
const publicKeyStats = await stat(publicKeyPath).catch(() => undefined);
if (!publicKeyStats?.isFile()) {
  console.error("Missing public release key: suwol-release-public-key.asc.");
  process.exit(1);
}
const publicKeyOutputPath = path.join(outputDir, "suwol-release-public-key.asc");
await copyFile(publicKeyPath, publicKeyOutputPath);
console.log(`Collected ${path.relative(root, publicKeyOutputPath)}.`);
