import type { ImageMetadata, LibraryItem } from "../shared/types";

export interface InternalLibraryItem extends LibraryItem {
  cacheKey: string;
  originalPath?: string;
  archive?: {
    archivePath: string;
    entryName: string;
    entryIndex: number;
  };
}

export interface ResolvedImageFile {
  path: string;
  mimeType: string;
}

export interface WorkerResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ThumbnailWorkerRequest {
  inputPath: string;
  outputPath: string;
  size: number;
}

export interface MetadataWorkerRequest {
  inputPath: string;
  maxTextLength: number;
  maxJsonLength: number;
}

export type MetadataWorkerResult = ImageMetadata;
