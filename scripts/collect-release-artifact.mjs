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

function platformPattern(name) {
  if (!/\.zip$/i.test(name)) return false;
  if (platform === "win") return /win/i.test(name);
  return /linux/i.test(name);
}

const entries = await readdir(releaseDir, { withFileTypes: true });
const candidates = [];
for (const entry of entries) {
  if (!entry.isFile() || !platformPattern(entry.name)) continue;
  const fullPath = path.join(releaseDir, entry.name);
  candidates.push({ fullPath, stats: await stat(fullPath) });
}

if (candidates.length === 0) {
  console.error(`No ${platform} ZIP artifact found in release/.`);
  process.exit(1);
}

candidates.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);

await mkdir(outputDir, { recursive: true });

const outputName = `SuwolView-${version}-${platform}-x64.zip`;
const outputPath = path.join(outputDir, outputName);
await copyFile(candidates[0].fullPath, outputPath);

console.log(`Collected ${path.relative(root, outputPath)}.`);
