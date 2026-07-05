import { describe, expect, it } from "vitest";
import { isBottomStatusBarVisible } from "../shared/chromePreferences";

describe("chrome visibility", () => {
  it("keeps the bottom status bar hidden in the default immersive layout", () => {
    expect(
      isBottomStatusBarVisible({
        topBarVisible: false,
        topBarMode: "auto",
        leftPanelVisible: false,
        rightPanelVisible: false
      })
    ).toBe(false);
  });

  it("shows the bottom status bar while the top toolbar is visible", () => {
    expect(
      isBottomStatusBarVisible({
        topBarVisible: true,
        topBarMode: "auto",
        leftPanelVisible: false,
        rightPanelVisible: false
      })
    ).toBe(true);
  });

  it("shows the bottom status bar when a side panel is visible", () => {
    expect(
      isBottomStatusBarVisible({
        topBarVisible: false,
        topBarMode: "auto",
        leftPanelVisible: false,
        rightPanelVisible: true
      })
    ).toBe(true);
  });

  it("shows the bottom status bar when the top toolbar is always visible", () => {
    expect(
      isBottomStatusBarVisible({
        topBarVisible: false,
        topBarMode: "always",
        leftPanelVisible: false,
        rightPanelVisible: false
      })
    ).toBe(true);
  });
});
