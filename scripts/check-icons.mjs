import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const requiredPngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const failures = [];

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkPng(fileName, expectedSize) {
  const filePath = path.join(assetsDir, fileName);
  if (!(await fileExists(filePath))) {
    failures.push(`Missing icon file: assets/${fileName}`);
    return;
  }

  const metadata = await sharp(filePath).metadata();
  if (metadata.width !== expectedSize || metadata.height !== expectedSize) {
    failures.push(`assets/${fileName} must be ${expectedSize}x${expectedSize}.`);
  }
}

const sourcePath = path.join(assetsDir, "icon-source.png");
if (!(await fileExists(sourcePath))) {
  failures.push("Missing icon source: assets/icon-source.png");
} else {
  const sourceMetadata = await sharp(sourcePath).metadata();
  if (sourceMetadata.format !== "png") {
    failures.push("assets/icon-source.png must be a PNG file.");
  }
  if (sourceMetadata.width !== sourceMetadata.height) {
    failures.push("assets/icon-source.png must be square.");
  }
  if ((sourceMetadata.width ?? 0) < 1024 || (sourceMetadata.height ?? 0) < 1024) {
    failures.push("assets/icon-source.png must be at least 1024x1024.");
  }
}

for (const size of requiredPngSizes) {
  await checkPng(`icon-${size}.png`, size);
}

await checkPng("icon.png", 512);

const icoPath = path.join(assetsDir, "icon.ico");
if (!(await fileExists(icoPath))) {
  failures.push("Missing Windows icon: assets/icon.ico");
} else {
  const ico = await readFile(icoPath);
  if (ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) < 1) {
    failures.push("assets/icon.ico does not look like a valid ICO file.");
  }
}

const icnsPath = path.join(assetsDir, "icon.icns");
if (await fileExists(icnsPath)) {
  const icns = await readFile(icnsPath);
  if (icns.subarray(0, 4).toString("ascii") !== "icns") {
    failures.push("assets/icon.icns does not look like a valid ICNS file.");
  }
} else {
  console.log("assets/icon.icns not present; macOS icon generation is skipped on non-macOS hosts.");
}

if (failures.length > 0) {
  console.error("Icon check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Icon check passed.");
