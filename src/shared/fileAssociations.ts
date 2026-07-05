export const WINDOWS_FILE_ASSOCIATION_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "svg",
  "tif",
  "tiff",
  "zip",
  "cbz"
] as const;

export type WindowsFileAssociationExtension = (typeof WINDOWS_FILE_ASSOCIATION_EXTENSIONS)[number];

export const WINDOWS_RELEASES_URL = "https://github.com/suwol-suite/SuwolView/releases";
