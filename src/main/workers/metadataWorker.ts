import { parentPort } from "node:worker_threads";
import { parse } from "exifr";
import sharp from "sharp";
import type { ImageMetadata } from "../../shared/types";
import type { MetadataWorkerRequest, WorkerResponse } from "../libraryTypes";

function stringifyMetadataValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyMetadataValue(entry)).filter(Boolean).join(", ");
  }
  return undefined;
}

function flattenExif(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>);
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    const stringValue = stringifyMetadataValue(value);
    if (stringValue) {
      result[key] = stringValue;
    }
  }
  return result;
}

async function readMetadata(request: MetadataWorkerRequest): Promise<ImageMetadata> {
  const basic = await sharp(request.inputPath, {
    animated: false,
    limitInputPixels: false
  }).metadata();

  let exif: Record<string, string>;
  try {
    exif = flattenExif(
      await parse(request.inputPath, {
        mergeOutput: true,
        translateValues: true,
        reviveValues: false,
        sanitize: true
      })
    );
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
    exif
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
