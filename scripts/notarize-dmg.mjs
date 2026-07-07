import { access, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { notarize } from "@electron/notarize";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const releaseDir = path.join(root, "release");
const requiredEnvVars = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];
const secretEnvNames = [...requiredEnvVars];

function redact(value) {
  let text = String(value ?? "");
  for (const name of secretEnvNames) {
    const secret = process.env[name];
    if (secret) {
      text = text.replaceAll(secret, "***");
    }
  }
  return text;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required macOS notarization environment variable: ${name}`);
  }
  return value;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveDmgPath(explicitPath) {
  if (explicitPath) {
    const dmgPath = path.resolve(explicitPath);
    const artifactStats = await stat(dmgPath).catch(() => undefined);
    if (!artifactStats?.isFile() || !/\.dmg$/i.test(dmgPath)) {
      throw new Error(`Invalid macOS DMG path: ${path.relative(root, dmgPath) || dmgPath}`);
    }
    return dmgPath;
  }

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

async function runCommand(command, args, label) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: root,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024
    });
    return result;
  } catch (error) {
    const output = redact([error?.stdout, error?.stderr].filter(Boolean).join("\n").trim());
    throw new Error(`${label} failed${output ? `:\n${output}` : "."}`, { cause: error });
  }
}

if (process.platform !== "darwin") {
  console.log("Skipping macOS DMG notarization on non-macOS host.");
  process.exit(0);
}

for (const name of requiredEnvVars) {
  requiredEnv(name);
}

try {
  if (!(await fileExists(releaseDir)) && !process.argv[2]) {
    throw new Error(`Release directory not found: ${path.relative(root, releaseDir)}`);
  }

  const dmgPath = await resolveDmgPath(process.argv[2]);
  console.log(`Notarizing and stapling macOS DMG: ${path.relative(root, dmgPath)}`);

  await notarize({
    tool: "notarytool",
    appPath: dmgPath,
    appleId: requiredEnv("APPLE_ID"),
    appleIdPassword: requiredEnv("APPLE_APP_SPECIFIC_PASSWORD"),
    teamId: requiredEnv("APPLE_TEAM_ID")
  });

  await runCommand("xcrun", ["stapler", "validate", dmgPath], `stapler validate ${path.relative(root, dmgPath)}`);
  console.log(`macOS DMG notarization, stapling, and validation completed: ${path.relative(root, dmgPath)}`);
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
