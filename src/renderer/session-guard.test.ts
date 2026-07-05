import { describe, expect, it } from "vitest";

function shouldAcceptResponse(currentRequestId: number, responseRequestId: number, currentItemId: string, responseItemId: string): boolean {
  return currentRequestId === responseRequestId && currentItemId === responseItemId;
}

describe("renderer request guards", () => {
  it("ignores stale metadata responses", () => {
    expect(shouldAcceptResponse(2, 1, "current", "current")).toBe(false);
    expect(shouldAcceptResponse(2, 2, "current", "old")).toBe(false);
    expect(shouldAcceptResponse(2, 2, "current", "current")).toBe(true);
  });
});
