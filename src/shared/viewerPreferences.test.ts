import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWER_PREFERENCES, normalizeViewerPreferences } from "./viewerPreferences";

describe("viewer preferences", () => {
  it("provides default viewer preferences", () => {
    expect(normalizeViewerPreferences()).toEqual(DEFAULT_VIEWER_PREFERENCES);
    expect(DEFAULT_VIEWER_PREFERENCES).toMatchObject({
      viewMode: "fit-window",
      upscaleSmallImages: false,
      interpolationFilter: "bilinear",
      filterPreset: "smooth",
      hdrEnabled: false,
      showZoomPercent: true,
      resetZoomOnImageChange: true
    });
  });

  it("recovers invalid viewer preference values", () => {
    expect(
      normalizeViewerPreferences({
        viewMode: "panorama" as never,
        upscaleSmallImages: "yes" as never,
        interpolationFilter: "magic" as never,
        filterPreset: "glow" as never,
        hdrEnabled: 1 as never,
        showZoomPercent: null as never,
        resetZoomOnImageChange: undefined
      })
    ).toEqual(DEFAULT_VIEWER_PREFERENCES);
  });

  it("keeps valid viewer preference values", () => {
    expect(
      normalizeViewerPreferences({
        viewMode: "fit-height",
        upscaleSmallImages: true,
        interpolationFilter: "nearest",
        filterPreset: "sharp",
        hdrEnabled: true,
        showZoomPercent: false,
        resetZoomOnImageChange: false
      })
    ).toMatchObject({
      viewMode: "fit-height",
      upscaleSmallImages: true,
      interpolationFilter: "nearest",
      filterPreset: "sharp",
      hdrEnabled: true,
      showZoomPercent: false,
      resetZoomOnImageChange: false
    });
  });
});
