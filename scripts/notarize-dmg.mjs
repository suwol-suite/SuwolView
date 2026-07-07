import { readdir } from "node:fs/promises";
import path from "node:path";
import { notarize } from "@electron/notarize";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const requiredEnvVars = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required macOS notarization environment variable: ${name}`);
  }
  return value;
}

async function findMacArmDmg() {
  const entries = await readdir(releaseDir, { withFileTypes: true });
  const dmgFiles = entries
    .filter((entry) => entry.isFile() && /^SuwolView-.+-mac-arm64\.dmg$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (dmgFiles.length !== 1) {
    throw new Error(`Expected exactly one macOS arm64 DMG in release/, found ${dmgFiles.length}: ${dmgFiles.join(", ") || "none"}`);
  }

  return path.join(releaseDir, dmgFiles[0]);
}

if (process.platform !== "darwin") {
  console.log("Skipping macOS DMG notarization on non-macOS host.");
  process.exit(0);
}

for (const name of requiredEnvVars) {
  requiredEnv(name);
}

const dmgPath = await findMacArmDmg();
console.log(`Notarizing and stapling macOS DMG: ${path.relative(root, dmgPath)}`);

await notarize({
  tool: "notarytool",
  appPath: dmgPath,
  appleId: requiredEnv("APPLE_ID"),
  appleIdPassword: requiredEnv("APPLE_APP_SPECIFIC_PASSWORD"),
  teamId: requiredEnv("APPLE_TEAM_ID")
});

console.log(`macOS DMG notarization and stapling completed: ${path.relative(root, dmgPath)}`);
