import { access, lstat, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const productAppName = "SuwolView.app";
const appEntitlements = path.join(root, "build", "entitlements.mac.plist");
const inheritEntitlements = path.join(root, "build", "entitlements.mac.inherit.plist");
const commandTimeoutMs = 120000;
const secretEnvNames = ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];

function relativePath(filePath) {
  return path.relative(root, filePath) || filePath;
}

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

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath) {
  try {
    return (await lstat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(filePath) {
  try {
    return (await lstat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function runCommand(command, args, label) {
  try {
    return await execFileAsync(command, args, {
      cwd: root,
      timeout: commandTimeoutMs,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? ` (${error.code})` : "";
    const output = redact([error?.stdout, error?.stderr].filter(Boolean).join("\n").trim());
    throw new Error(`${label} failed${code}${output ? `:\n${output}` : "."}`, { cause: error });
  }
}

async function findDirectories(directoryPath, predicate, depth = 0, maxDepth = 8) {
  if (depth > maxDepth || !(await isDirectory(directoryPath))) return [];
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const fullPath = path.join(directoryPath, entry.name);
    if (predicate(fullPath, entry.name)) {
      matches.push(fullPath);
    }
    matches.push(...(await findDirectories(fullPath, predicate, depth + 1, maxDepth)));
  }
  return matches;
}

async function findFiles(directoryPath, predicate, depth = 0, maxDepth = 12) {
  if (depth > maxDepth || !(await isDirectory(directoryPath))) return [];
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(fullPath, predicate, depth + 1, maxDepth)));
      continue;
    }
    if (entry.isFile() && predicate(fullPath, entry.name)) {
      matches.push(fullPath);
    }
  }
  return matches;
}

async function findAppBundle(appOutDir) {
  const directPath = path.join(appOutDir, productAppName);
  if (await isDirectory(directPath)) {
    return directPath;
  }

  const foundApps = await findDirectories(appOutDir, (_fullPath, name) => name === productAppName, 0, 4);
  if (foundApps.length !== 1) {
    throw new Error(
      `Expected exactly one ${productAppName} in ${relativePath(appOutDir)}, found ${foundApps.length}: ${
        foundApps.map(relativePath).join(", ") || "none"
      }`
    );
  }
  return foundApps[0];
}

async function findDeveloperIdApplicationIdentity() {
  const { stdout } = await runCommand("security", ["find-identity", "-v", "-p", "codesigning"], "find code signing identities");
  const identities = stdout
    .split(/\r?\n/)
    .map((line) => line.match(/\)\s+([0-9A-F]{40})\s+"([^"]*Developer ID Application[^"]*)"/i))
    .filter(Boolean)
    .map((match) => ({ hash: match[1], name: match[2] }));

  if (identities.length === 0) {
    throw new Error("No Developer ID Application identity found in the available code signing identities.");
  }

  console.log(`Developer ID Application identity found (${identities.length} available).`);
  return identities[0].hash;
}

async function isMachO(filePath) {
  try {
    const { stdout } = await runCommand("file", ["-b", filePath], `inspect ${relativePath(filePath)}`);
    return stdout.includes("Mach-O");
  } catch {
    return false;
  }
}

function uniqueSorted(paths, descendingDepth = false) {
  const unique = Array.from(new Set(paths));
  return unique.sort((a, b) => {
    const depthDelta = b.split(path.sep).length - a.split(path.sep).length;
    return descendingDepth ? depthDelta || a.localeCompare(b) : -depthDelta || a.localeCompare(b);
  });
}

async function collectMachOTargets(appBundle) {
  const contentsPath = path.join(appBundle, "Contents");
  const frameworksPath = path.join(contentsPath, "Frameworks");
  const asarUnpackedPath = path.join(contentsPath, "Resources", "app.asar.unpacked");
  const mainExecutable = path.join(contentsPath, "MacOS", "SuwolView");

  if (!(await isFile(mainExecutable))) {
    throw new Error(`Expected main executable not found: ${relativePath(mainExecutable)}`);
  }

  const frameworkCandidates = await findFiles(frameworksPath, () => true);
  const nativeCandidates = await findFiles(
    asarUnpackedPath,
    (filePath) => filePath.endsWith(".node") || filePath.endsWith(".dylib")
  );

  console.log(`macOS signing search: framework file candidates=${frameworkCandidates.length}`);
  console.log(`macOS signing search: app.asar.unpacked native candidates=${nativeCandidates.length}`);

  const candidates = uniqueSorted([mainExecutable, ...frameworkCandidates, ...nativeCandidates], true);
  const machOFiles = [];
  for (const candidate of candidates) {
    if (await isMachO(candidate)) {
      machOFiles.push(candidate);
    }
  }

  const nodeFiles = machOFiles.filter((filePath) => filePath.endsWith(".node"));
  const dylibFiles = machOFiles.filter((filePath) => filePath.endsWith(".dylib"));
  console.log(`macOS signing search: Mach-O files=${machOFiles.length}, .node=${nodeFiles.length}, .dylib=${dylibFiles.length}`);

  return machOFiles;
}

async function collectBundleTargets(appBundle) {
  const nestedApps = (await findDirectories(
    path.join(appBundle, "Contents", "Frameworks"),
    (_fullPath, name) => name.endsWith(".app")
  )).filter((nestedApp) => nestedApp !== appBundle);
  const frameworks = await findDirectories(
    path.join(appBundle, "Contents", "Frameworks"),
    (_fullPath, name) => name.endsWith(".framework")
  );

  console.log(`macOS signing search: nested app bundles=${nestedApps.length}, frameworks=${frameworks.length}`);
  return {
    nestedApps: uniqueSorted(nestedApps, true),
    frameworks: uniqueSorted(frameworks, true)
  };
}

async function signPath(identity, targetPath, label, entitlementsPath) {
  const args = ["--force", "--timestamp", "--options", "runtime"];
  if (entitlementsPath) {
    args.push("--entitlements", entitlementsPath);
  }
  args.push("--sign", identity, targetPath);
  await runCommand("codesign", args, label);
}

async function verifyAppBundle(appBundle) {
  await runCommand("codesign", ["--verify", "--deep", "--verbose=4", appBundle], `verify app bundle ${relativePath(appBundle)}`);
  await runCommand("codesign", ["-dv", "--verbose=4", appBundle], `inspect app signature ${relativePath(appBundle)}`);
}

export default async function resignMacApp(context = {}) {
  if (process.platform !== "darwin") {
    console.log("Skipping macOS app resigning on non-macOS host.");
    return;
  }

  if (!process.env.CI) {
    console.log("Skipping macOS app resigning outside CI.");
    return;
  }

  if (context.electronPlatformName && context.electronPlatformName !== "darwin") {
    console.log(`Skipping macOS app resigning for platform ${context.electronPlatformName}.`);
    return;
  }

  if (!context.appOutDir) {
    throw new Error("electron-builder afterSign context is missing appOutDir.");
  }

  if (!(await exists(appEntitlements))) {
    throw new Error(`Missing app entitlements file: ${relativePath(appEntitlements)}`);
  }

  if (!(await exists(inheritEntitlements))) {
    throw new Error(`Missing inherited entitlements file: ${relativePath(inheritEntitlements)}`);
  }

  const appBundle = await findAppBundle(context.appOutDir);
  const identity = await findDeveloperIdApplicationIdentity();
  const machOFiles = await collectMachOTargets(appBundle);
  const { nestedApps, frameworks } = await collectBundleTargets(appBundle);

  for (const filePath of machOFiles) {
    await signPath(identity, filePath, `sign Mach-O ${relativePath(filePath)}`);
  }

  for (const framework of frameworks) {
    await signPath(identity, framework, `sign framework ${relativePath(framework)}`);
  }

  for (const nestedApp of nestedApps) {
    await signPath(identity, nestedApp, `sign nested app ${relativePath(nestedApp)}`, inheritEntitlements);
  }

  await runCommand(
    "codesign",
    [
      "--force",
      "--deep",
      "--timestamp",
      "--options",
      "runtime",
      "--entitlements",
      appEntitlements,
      "--sign",
      identity,
      appBundle
    ],
    `sign app bundle ${relativePath(appBundle)}`
  );

  await verifyAppBundle(appBundle);
  console.log(`macOS app resigning completed: ${relativePath(appBundle)}`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  await resignMacApp({
    appOutDir: process.argv[2] ?? path.join(root, "release", "mac-arm64"),
    electronPlatformName: "darwin"
  });
}
