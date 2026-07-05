import type { AppError, AppResult, ImageMetadata } from "../shared/types";
import { WorkerRunError } from "./workerRunner";

export const METADATA_MAX_FILE_SIZE_BYTES = 80 * 1024 * 1024;
export const METADATA_MAX_TEXT_LENGTH = 2 * 1024 * 1024;
export const METADATA_MAX_JSON_LENGTH = 2 * 1024 * 1024;
export const METADATA_TIMEOUT_MS = 5000;
export const METADATA_FAILURE_CACHE_TTL_MS = 60 * 1000;
export const METADATA_WORKER_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 32
} as const;

export function appFailure(code: string, messageKey: string, details?: string): AppError {
  return { code, messageKey, details };
}

export function failedResult<T>(failure: AppError): AppResult<T> {
  return { ok: false, ...failure };
}

export function metadataTooLargeFailure(sizeBytes?: number): AppError {
  const sizeDetail = sizeBytes ? `File size: ${sizeBytes} bytes.` : undefined;
  return appFailure("METADATA_SKIPPED_TOO_LARGE", "errors.metadataSkippedTooLarge", sizeDetail);
}

export function shouldSkipMetadataBySize(sizeBytes?: number): boolean {
  return typeof sizeBytes === "number" && sizeBytes > METADATA_MAX_FILE_SIZE_BYTES;
}

export function classifyMetadataFailure(error: unknown): AppError {
  if (error instanceof WorkerRunError) {
    if (error.code === "WORKER_TIMEOUT") {
      return appFailure("METADATA_TIMEOUT", "errors.metadataTimeout", error.message);
    }
    if (error.code === "WORKER_OUT_OF_MEMORY" || error.code === "WORKER_EXITED") {
      return appFailure("METADATA_WORKER_OUT_OF_MEMORY", "errors.metadataWorkerOutOfMemory", error.message);
    }
    return appFailure("METADATA_FAILED", "errors.metadataFailed", error.message);
  }

  if (error instanceof Error) {
    return appFailure("METADATA_FAILED", "errors.metadataFailed", error.message);
  }

  return appFailure("METADATA_FAILED", "errors.metadataFailed", String(error));
}

export class MetadataFailureCache {
  private readonly failures = new Map<string, { failure: AppError; failedAt: number }>();

  get(key: string, now = Date.now()): AppResult<ImageMetadata> | undefined {
    const cached = this.failures.get(key);
    if (!cached) return undefined;
    if (now - cached.failedAt > METADATA_FAILURE_CACHE_TTL_MS) {
      this.failures.delete(key);
      return undefined;
    }
    return failedResult(cached.failure);
  }

  set(key: string, failure: AppError, now = Date.now()): void {
    this.failures.set(key, { failure, failedAt: now });
  }

  clear(): void {
    this.failures.clear();
  }
}
