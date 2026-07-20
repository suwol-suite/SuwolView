export const WHEEL_PAGE_THRESHOLD = 100;
export const WHEEL_PAGE_COOLDOWN_MS = 275;

export interface WheelAccumulatorState {
  accumulated: number;
  direction: -1 | 1 | undefined;
  lastMoveAt: number;
}
export interface WheelPageDecision {
  state: WheelAccumulatorState;
  direction?: "next" | "previous";
}

export const INITIAL_WHEEL_ACCUMULATOR: WheelAccumulatorState = {
  accumulated: 0,
  direction: undefined,
  lastMoveAt: -Infinity
};

export function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * 800;
  return deltaY;
}

export function consumeWheelPage(
  current: WheelAccumulatorState,
  deltaY: number,
  deltaMode: number,
  now: number
): WheelPageDecision {
  if (!Number.isFinite(deltaY) || deltaY === 0) return { state: current };
  if (now - current.lastMoveAt < WHEEL_PAGE_COOLDOWN_MS) {
    return { state: { ...current, accumulated: 0 } };
  }

  const direction = deltaY > 0 ? 1 : -1;
  const normalizedDelta = normalizeWheelDelta(deltaY, deltaMode);
  const accumulated = current.direction !== undefined && current.direction !== direction
    ? normalizedDelta
    : current.accumulated + normalizedDelta;
  if (Math.abs(accumulated) < WHEEL_PAGE_THRESHOLD) {
    return { state: { ...current, accumulated, direction } };
  }

  return {
    state: { accumulated: 0, direction: undefined, lastMoveAt: now },
    direction: direction > 0 ? "next" : "previous"
  };
}
