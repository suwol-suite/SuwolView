import type { PanelPreferences } from "./types";

export const LEFT_PANEL_DEFAULT_WIDTH = 260;
export const RIGHT_PANEL_DEFAULT_WIDTH = 320;
export const LEFT_PANEL_MIN_WIDTH = 180;
export const LEFT_PANEL_MAX_WIDTH = 520;
export const RIGHT_PANEL_MIN_WIDTH = 240;
export const RIGHT_PANEL_MAX_WIDTH = 620;

export const DEFAULT_PANEL_PREFERENCES: PanelPreferences = {
  leftPanelVisible: false,
  rightPanelVisible: false,
  leftPanelWidth: LEFT_PANEL_DEFAULT_WIDTH,
  rightPanelWidth: RIGHT_PANEL_DEFAULT_WIDTH
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function validWidth(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

export function normalizePanelPreferences(input: Partial<PanelPreferences> = {}): PanelPreferences {
  return {
    leftPanelVisible: validBoolean(input.leftPanelVisible, DEFAULT_PANEL_PREFERENCES.leftPanelVisible),
    rightPanelVisible: validBoolean(input.rightPanelVisible, DEFAULT_PANEL_PREFERENCES.rightPanelVisible),
    leftPanelWidth: validWidth(
      input.leftPanelWidth,
      DEFAULT_PANEL_PREFERENCES.leftPanelWidth,
      LEFT_PANEL_MIN_WIDTH,
      LEFT_PANEL_MAX_WIDTH
    ),
    rightPanelWidth: validWidth(
      input.rightPanelWidth,
      DEFAULT_PANEL_PREFERENCES.rightPanelWidth,
      RIGHT_PANEL_MIN_WIDTH,
      RIGHT_PANEL_MAX_WIDTH
    )
  };
}
