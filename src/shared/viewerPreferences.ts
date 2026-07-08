import type {
  ImageFilterPreset,
  ImageViewMode,
  InterpolationFilter,
  ViewerPreferences
} from "./types";

export const DEFAULT_VIEWER_PREFERENCES: ViewerPreferences = {
  viewMode: "fit-window",
  upscaleSmallImages: false,
  interpolationFilter: "bilinear",
  filterPreset: "smooth",
  hdrEnabled: false,
  showZoomPercent: true,
  resetZoomOnImageChange: true
};

const imageViewModes = new Set<ImageViewMode>([
  "original",
  "fit-window",
  "fit-width",
  "fit-height",
  "smart-two-page-left-to-right",
  "smart-two-page-right-to-left",
  "webtoon"
]);

const interpolationFilters = new Set<InterpolationFilter>(["nearest", "bilinear", "bicubic", "lanczos"]);
const filterPresets = new Set<ImageFilterPreset>(["none", "smooth", "extra-smooth", "sharp"]);

function validBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function validImageViewMode(value: unknown, fallback: ImageViewMode): ImageViewMode {
  return typeof value === "string" && imageViewModes.has(value as ImageViewMode) ? (value as ImageViewMode) : fallback;
}

function validInterpolationFilter(value: unknown, fallback: InterpolationFilter): InterpolationFilter {
  return typeof value === "string" && interpolationFilters.has(value as InterpolationFilter)
    ? (value as InterpolationFilter)
    : fallback;
}

function validFilterPreset(value: unknown, fallback: ImageFilterPreset): ImageFilterPreset {
  return typeof value === "string" && filterPresets.has(value as ImageFilterPreset) ? (value as ImageFilterPreset) : fallback;
}

export function normalizeViewerPreferences(input: Partial<ViewerPreferences> = {}): ViewerPreferences {
  return {
    viewMode: validImageViewMode(input.viewMode, DEFAULT_VIEWER_PREFERENCES.viewMode),
    upscaleSmallImages: validBoolean(input.upscaleSmallImages, DEFAULT_VIEWER_PREFERENCES.upscaleSmallImages),
    interpolationFilter: validInterpolationFilter(input.interpolationFilter, DEFAULT_VIEWER_PREFERENCES.interpolationFilter),
    filterPreset: validFilterPreset(input.filterPreset, DEFAULT_VIEWER_PREFERENCES.filterPreset),
    hdrEnabled: validBoolean(input.hdrEnabled, DEFAULT_VIEWER_PREFERENCES.hdrEnabled),
    showZoomPercent: validBoolean(input.showZoomPercent, DEFAULT_VIEWER_PREFERENCES.showZoomPercent),
    resetZoomOnImageChange: validBoolean(input.resetZoomOnImageChange, DEFAULT_VIEWER_PREFERENCES.resetZoomOnImageChange)
  };
}
