import { describe, expect, it } from "vitest";
import { consumeWheelPage, INITIAL_WHEEL_ACCUMULATOR, normalizeWheelDelta, WHEEL_PAGE_COOLDOWN_MS } from "./navigationInput";

describe("viewer wheel navigation", () => {
  it("normalizes line and page wheel deltas", () => {
    expect(normalizeWheelDelta(2, 1)).toBe(32);
    expect(normalizeWheelDelta(1, 2)).toBe(800);
  });

  it("accumulates small deltas and moves only one page at the threshold", () => {
    let state = INITIAL_WHEEL_ACCUMULATOR;
    let result = consumeWheelPage(state, 40, 0, 0);
    expect(result.direction).toBeUndefined();
    state = result.state;
    result = consumeWheelPage(state, 60, 0, 10);
    expect(result.direction).toBe("next");
    expect(result.state.accumulated).toBe(0);
  });

  it("resets on direction changes and suppresses momentum during cooldown", () => {
    const first = consumeWheelPage(INITIAL_WHEEL_ACCUMULATOR, 100, 0, 0);
    expect(first.direction).toBe("next");
    const duringCooldown = consumeWheelPage(first.state, 100, 0, WHEEL_PAGE_COOLDOWN_MS - 1);
    expect(duringCooldown.direction).toBeUndefined();
    const reversed = consumeWheelPage({ ...duringCooldown.state, lastMoveAt: -Infinity }, -60, 0, 500);
    expect(reversed.state.accumulated).toBe(-60);
  });
});
