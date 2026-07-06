import { describe, expect, it } from "vitest";
import type { AppResult, ImageMetadata } from "../shared/types";
import { appFailure, failedResult } from "./metadataSafety";

describe("structured app results", () => {
  it("uses the shared AppResult error shape", () => {
    const result: AppResult<ImageMetadata> = failedResult(appFailure("OPEN_FAILED", "errors.actionFailed", "detail"));

    expect(result).toEqual({
      ok: false,
      code: "OPEN_FAILED",
      messageKey: "errors.actionFailed",
      details: "detail"
    });
  });
});
