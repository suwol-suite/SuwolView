import { describe, expect, it } from "vitest";
import type { UpdateState } from "../shared/types";
import { elapsedSecondsSince, isUpdateCheckActive, updateElapsed } from "./updateProgress";

describe("update progress helpers", () => {
  it("calculates elapsed seconds from the operation start", () => {
    expect(elapsedSecondsSince("2026-07-20T00:00:00.000Z", Date.parse("2026-07-20T00:00:12.900Z"))).toBe(12);
  });

  it("only treats check phases as active", () => {
    expect(isUpdateCheckActive("release-lookup")).toBe(true);
    expect(isUpdateCheckActive("complete")).toBe(false);
    expect(isUpdateCheckActive("timeout")).toBe(false);
  });

  it("does not keep an elapsed timer running after a terminal phase", () => {
    const state: UpdateState = { status: "available", supported: true, updateAvailable: true, downloaded: false, phase: "complete", elapsedSeconds: 2 };
    expect(updateElapsed(state, Date.now())).toBe(state);
  });
});
