import { describe, expect, it } from "vitest";
import {
  classifyMetadataFailure,
  MetadataFailureCache,
  METADATA_FAILURE_CACHE_TTL_MS,
  METADATA_MAX_FILE_SIZE_BYTES,
  metadataTooLargeFailure,
  shouldSkipMetadataBySize
} from "./metadataSafety";
import { WorkerRunError } from "./workerRunner";

describe("metadata safety", () => {
  it("skips metadata extraction for files above the size limit", () => {
    expect(shouldSkipMetadataBySize(METADATA_MAX_FILE_SIZE_BYTES)).toBe(false);
    expect(shouldSkipMetadataBySize(METADATA_MAX_FILE_SIZE_BYTES + 1)).toBe(true);
    expect(metadataTooLargeFailure(1).messageKey).toBe("errors.metadataSkippedTooLarge");
  });

  it("classifies timeout and worker memory failures as app errors", () => {
    expect(classifyMetadataFailure(new WorkerRunError("WORKER_TIMEOUT", "timeout")).messageKey).toBe("errors.metadataTimeout");
    expect(classifyMetadataFailure(new WorkerRunError("WORKER_OUT_OF_MEMORY", "oom")).messageKey).toBe(
      "errors.metadataWorkerOutOfMemory"
    );
    expect(classifyMetadataFailure(new WorkerRunError("WORKER_EXITED", "exit")).messageKey).toBe(
      "errors.metadataWorkerOutOfMemory"
    );
  });

  it("caches metadata failures for a short time", () => {
    const cache = new MetadataFailureCache();
    cache.set("item", metadataTooLargeFailure(1), 1000);

    expect(cache.get("item", 1000)?.ok).toBe(false);
    expect(cache.get("item", 1000 + METADATA_FAILURE_CACHE_TTL_MS + 1)).toBeUndefined();
  });
});
