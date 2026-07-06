import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const sourcePath = path.join(assetsDir, "icon-source.png");
const sourceIcon = await readFile(sourcePath);
const pngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

await mkdir(assetsDir, { recursive: true });

async function pngBuffer(size) {
  return sharp(sourceIcon).resize(size, size).png().toBuffer();
}

for (const size of pngSizes) {
  await sharp(sourceIcon).resize(size, size).png().toFile(path.join(assetsDir, `icon-${size}.png`));
}

await sharp(sourceIcon).resize(512, 512).png().toFile(path.join(assetsDir, "icon.png"));

const icoFrames = await Promise.all(
  icoSizes.map(async (size) => ({
    size,
    data: await pngBuffer(size)
  }))
);

const headerSize = 6 + icoFrames.length * 16;
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoFrames.length, 4);

let imageOffset = headerSize;
icoFrames.forEach((frame, index) => {
  const entryOffset = 6 + index * 16;
  header.writeUInt8(frame.size === 256 ? 0 : frame.size, entryOffset);
  header.writeUInt8(frame.size === 256 ? 0 : frame.size, entryOffset + 1);
  header.writeUInt8(0, entryOffset + 2);
  header.writeUInt8(0, entryOffset + 3);
  header.writeUInt16LE(1, entryOffset + 4);
  header.writeUInt16LE(32, entryOffset + 6);
  header.writeUInt32LE(frame.data.length, entryOffset + 8);
  header.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += frame.data.length;
});

await writeFile(path.join(assetsDir, "icon.ico"), Buffer.concat([header, ...icoFrames.map((frame) => frame.data)]));

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function generateIcnsOnMac() {
  if (process.platform !== "darwin") {
    console.log("Skipping assets/icon.icns generation: iconutil is only available on macOS.");
    return;
  }

  const iconsetDir = path.join(assetsDir, "icon.iconset");
  await rm(iconsetDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });

  const iconsetFiles = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024]
  ];

  for (const [fileName, size] of iconsetFiles) {
    await sharp(sourceIcon).resize(size, size).png().toFile(path.join(iconsetDir, fileName));
  }

  await run("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(assetsDir, "icon.icns")]);
  await rm(iconsetDir, { recursive: true, force: true });
}

await generateIcnsOnMac();

console.log("Generated SuwolView icon assets.");
