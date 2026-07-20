import type { UpdateCheckPhase, UpdateState } from "../shared/types";

export const UPDATE_CHECK_UI_TIMEOUT_MS = 25_000;

export function isUpdateCheckActive(phase: UpdateCheckPhase | undefined): boolean {
  return phase === "starting" || phase === "release-lookup" || phase === "release-lookup-complete" || phase === "native-check";
}

export function elapsedSecondsSince(startedAt: string | undefined, now = Date.now()): number {
  if (!startedAt) return 0;
  const timestamp = Date.parse(startedAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now - timestamp) / 1000));
}

export function updateElapsed(state: UpdateState | undefined, now = Date.now()): UpdateState | undefined {
  if (!state || !isUpdateCheckActive(state.phase)) return state;
  return { ...state, elapsedSeconds: elapsedSecondsSince(state.startedAt, now) };
}

