import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const policy = JSON.parse(await readFile(path.join(root, "license-policy.json"), "utf8"));

const forbiddenPatterns = policy.forbiddenLicensePatterns.map((pattern) => new RegExp(pattern, "i"));
const reviewPatterns = policy.reviewRequiredLicensePatterns.map((pattern) => new RegExp(pattern, "i"));
const licenseFileNames = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "COPYING"];

async function exists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function findLicenseFile(packageDir) {
  for (const fileName of licenseFileNames) {
    const candidate = path.join(packageDir, fileName);
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function detectLicenseFromText(text) {
  const normalized = text.slice(0, 8000).replace(/\s+/g, " ");
  if (/MIT License/i.test(normalized)) return "MIT";
  if (/Apache License,? Version 2\.0/i.test(normalized)) return "Apache-2.0";
  if (/BSD 3-Clause/i.test(normalized)) return "BSD-3-Clause";
  if (/BSD 2-Clause/i.test(normalized)) return "BSD-2-Clause";
  if (/Mozilla Public License Version 2\.0/i.test(normalized)) return "MPL-2.0";
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(normalized)) return "LGPL";
  if (/ISC License/i.test(normalized)) return "ISC";
  if (/The Unlicense/i.test(normalized)) return "Unlicense";
  if (/zlib License/i.test(normalized)) return "Zlib";
  return undefined;
}

function licenseToString(packageJson) {
  if (typeof packageJson.license === "string") {
    return packageJson.license;
  }
  if (packageJson.license?.type) {
    return packageJson.license.type;
  }
  if (Array.isArray(packageJson.licenses)) {
    return packageJson.licenses
      .map((license) => (typeof license === "string" ? license : license.type))
      .filter(Boolean)
      .join(" OR ");
  }
  return undefined;
}

async function readPackageJson(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const data = await readFile(packageJsonPath, "utf8");
  return JSON.parse(data);
}

async function listPackageDirs(nodeModulesDir) {
  const dirs = [];
  const entries = await readdir(nodeModulesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin") continue;
    const fullPath = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith("@")) {
      const scopedEntries = await readdir(fullPath, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        if (scopedEntry.isDirectory()) {
          dirs.push(path.join(fullPath, scopedEntry.name));
        }
      }
    } else {
      dirs.push(fullPath);
    }
  }
  return dirs;
}

function classifyLicense(license) {
  if (!license || /UNKNOWN|UNLICENSED/i.test(license)) {
    return { status: "BLOCKED", reason: "missing or unclear license" };
  }

  const forbidden = forbiddenPatterns.find((pattern) => pattern.test(license));
  if (forbidden) {
    return { status: "BLOCKED", reason: `blocked license "${license}"` };
  }

  const review = reviewPatterns.find((pattern) => pattern.test(license));
  if (review) {
    return { status: "REVIEW", reason: `review-required license "${license}"` };
  }

  return { status: "PASS", reason: `allowed license "${license}"` };
}

const nodeModulesDir = path.join(root, "node_modules");
const packages = [];
const passed = [];
const reviews = [];
const blocked = [];

try {
  await readdir(nodeModulesDir);
} catch {
  console.error("node_modules is missing. Run npm install or npm ci before license checks.");
  process.exit(1);
}

for (const packageDir of await listPackageDirs(nodeModulesDir)) {
  let packageJson;
  try {
    packageJson = await readPackageJson(packageDir);
  } catch {
    continue;
  }

  const packageName = packageJson.name ?? path.basename(packageDir);
  if (packageJson.private === true) continue;

  let license = licenseToString(packageJson);
  if (!license || /UNKNOWN|UNLICENSED/i.test(license)) {
    const licenseFile = await findLicenseFile(packageDir);
    if (licenseFile) {
      const detected = detectLicenseFromText(await readFile(licenseFile, "utf8"));
      license = detected ?? license;
    }
  }

  const packageInfo = {
    name: packageName,
    version: packageJson.version ?? "unknown",
    license: license ?? "UNKNOWN"
  };
  packages.push(packageInfo);

  const classification = classifyLicense(license);
  const line = `${packageInfo.name}@${packageInfo.version}: ${classification.reason}`;
  if (classification.status === "PASS") {
    passed.push(line);
  } else if (classification.status === "REVIEW") {
    reviews.push(line);
  } else {
    blocked.push(line);
  }
}

packages.sort((a, b) => a.name.localeCompare(b.name));
passed.sort();
reviews.sort();
blocked.sort();

const status = blocked.length > 0 ? "BLOCKED" : reviews.length > 0 ? "REVIEW" : "PASS";

console.log(`License check status: ${status}`);
console.log(`Total packages checked: ${packages.length}`);
console.log(`Allowed packages: ${passed.length}`);
console.log(`Review-required packages: ${reviews.length}`);
console.log(`Blocked packages: ${blocked.length}`);

if (reviews.length > 0) {
  console.log("Review-required package list:");
  for (const review of reviews) {
    console.log(`- ${review}`);
  }
}

if (blocked.length > 0) {
  console.error("Blocked package list:");
  for (const failure of blocked) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (reviews.length > 0) {
  console.log("License check completed with REVIEW items.");
} else {
  console.log("License check passed.");
}
