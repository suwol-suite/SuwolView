import type { ChromeBarMode, ChromePreferences } from "./types";

export const EDGE_HOT_ZONE_PX = 18;
export const AUTO_HIDE_DELAY_MS = 1200;

export const DEFAULT_CHROME_PREFERENCES: ChromePreferences = {
  topBarMode: "auto",
  bottomBarMode: "auto"
};

function validChromeBarMode(value: unknown, fallback: ChromeBarMode): ChromeBarMode {
  return value === "always" || value === "auto" ? value : fallback;
}

export function normalizeChromePreferences(input: Partial<ChromePreferences> = {}): ChromePreferences {
  return {
    topBarMode: validChromeBarMode(input.topBarMode, DEFAULT_CHROME_PREFERENCES.topBarMode),
    bottomBarMode: validChromeBarMode(input.bottomBarMode, DEFAULT_CHROME_PREFERENCES.bottomBarMode)
  };
}

export function isBottomStatusBarVisible(input: {
  topBarVisible: boolean;
  topBarMode: ChromeBarMode;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
}): boolean {
  return input.topBarVisible || input.topBarMode === "always" || input.leftPanelVisible || input.rightPanelVisible;
}
