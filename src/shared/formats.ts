import type { SupportInfo, SupportLevel } from "./types";

export const NATIVE_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "svg"
] as const;

export const CONVERTED_IMAGE_EXTENSIONS = ["tif", "tiff"] as const;
export const ARCHIVE_EXTENSIONS = ["zip", "cbz"] as const;

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/vnd.microsoft.icon",
  svg: "image/svg+xml",
  tif: "image/png",
  tiff: "image/png"
};

export function normalizeExtension(fileNameOrExtension: string): string {
  const value = fileNameOrExtension.trim().toLowerCase();
  const lastDot = value.lastIndexOf(".");
  return (lastDot >= 0 ? value.slice(lastDot + 1) : value).replace(/^\.+/, "");
}

export function getSupportLevel(extension: string): SupportLevel | undefined {
  const normalized = normalizeExtension(extension);
  if ((NATIVE_IMAGE_EXTENSIONS as readonly string[]).includes(normalized)) {
    return "native";
  }
  if ((CONVERTED_IMAGE_EXTENSIONS as readonly string[]).includes(normalized)) {
    return "converted";
  }
  return undefined;
}

export function getImageSupport(fileNameOrExtension: string): SupportInfo | undefined {
  const extension = normalizeExtension(fileNameOrExtension);
  const level = getSupportLevel(extension);
  if (!level) return undefined;
  return {
    extension,
    level,
    label: level === "native" ? "Native" : "Converted",
    mimeType: MIME_TYPES[extension] ?? "application/octet-stream"
  };
}

export function isSupportedImage(fileName: string): boolean {
  return getImageSupport(fileName) !== undefined;
}

export function isArchive(fileName: string): boolean {
  return (ARCHIVE_EXTENSIONS as readonly string[]).includes(normalizeExtension(fileName));
}

export function compareNaturalName(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

export function sortImageNames<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => compareNaturalName(left.name, right.name));
}
