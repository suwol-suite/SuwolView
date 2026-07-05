import { parentPort } from "node:worker_threads";
import { parse } from "exifr";
import sharp from "sharp";
import type { ImageMetadata } from "../../shared/types";
import type { MetadataWorkerRequest, WorkerResponse } from "../libraryTypes";

sharp.concurrency(1);
sharp.cache(false);

interface FlattenResult {
  exif: Record<string, string>;
  truncated: boolean;
}

function trimMetadataText(value: string, maxLength: number): { value: string; truncated: boolean } {
  if (value.length <= maxLength) {
    return { value, truncated: false };
  }
  return { value: value.slice(0, maxLength), truncated: true };
}

function stringifyMetadataValue(value: unknown, maxLength: number): { value?: string; truncated: boolean } | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return { value: value.toISOString(), truncated: false };
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return trimMetadataText(String(value), maxLength);
  }
  if (Array.isArray(value)) {
    const values = value
      .map((entry) => stringifyMetadataValue(entry, maxLength))
      .filter((entry): entry is { value: string; truncated: boolean } => Boolean(entry?.value));
    const truncated = values.some((entry) => entry.truncated);
    const joined = trimMetadataText(values.map((entry) => entry.value).join(", "), maxLength);
    return { value: joined.value, truncated: truncated || joined.truncated };
  }
  return undefined;
}

function flattenExif(input: unknown, maxTextLength: number, maxJsonLength: number): FlattenResult {
  if (!input || typeof input !== "object") return { exif: {}, truncated: false };
  const entries = Object.entries(input as Record<string, unknown>);
  const result: Record<string, string> = {};
  let remaining = maxJsonLength;
  let truncated = false;
  for (const [key, value] of entries) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const stringValue = stringifyMetadataValue(value, Math.min(maxTextLength, remaining));
    if (stringValue?.value) {
      result[key] = stringValue.value;
      remaining -= stringValue.value.length;
      truncated = truncated || stringValue.truncated;
    }
  }
  return { exif: result, truncated };
}

async function readMetadata(request: MetadataWorkerRequest): Promise<ImageMetadata> {
  const basic = await sharp(request.inputPath, {
    animated: false,
    limitInputPixels: false
  }).metadata();

  let exif: Record<string, string>;
  let truncated = false;
  try {
    const flattened = flattenExif(
      await parse(request.inputPath, {
        mergeOutput: true,
        translateValues: true,
        reviveValues: false,
        sanitize: true
      }),
      request.maxTextLength,
      request.maxJsonLength
    );
    exif = flattened.exif;
    truncated = flattened.truncated;
  } catch {
    exif = {};
  }

  return {
    basic: {
      width: basic.width,
      height: basic.height,
      format: basic.format,
      space: basic.space,
      channels: basic.channels,
      density: basic.density,
      orientation: basic.orientation,
      pages: basic.pages,
      hasAlpha: basic.hasAlpha
    },
    exif,
    truncated
  };
}

parentPort?.on("message", (request: MetadataWorkerRequest) => {
  void readMetadata(request)
    .then((data) => {
      const response: WorkerResponse<ImageMetadata> = { ok: true, data };
      parentPort?.postMessage(response);
    })
    .catch((error: unknown) => {
      const response: WorkerResponse<ImageMetadata> = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
      parentPort?.postMessage(response);
    });
});
