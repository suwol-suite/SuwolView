import type { ImageViewMode } from "../shared/types";

export const MIN_IMAGE_SCALE = 0.05;
export const MAX_IMAGE_SCALE = 12;

export interface ComputeImageScaleInput {
  imageWidth: number;
  imageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  viewMode: ImageViewMode;
  upscaleSmallImages: boolean;
  userZoom: number;
}

export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, value));
}

function validDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function fitBaseScale(input: ComputeImageScaleInput): number {
  const widthScale = input.viewportWidth / input.imageWidth;
  const heightScale = input.viewportHeight / input.imageHeight;

  if (input.viewMode === "fit-width") return widthScale;
  if (input.viewMode === "fit-height") return heightScale;
  if (input.viewMode === "fit-window") return Math.min(widthScale, heightScale);
  if (input.viewMode === "smart-two-page-left-to-right" || input.viewMode === "smart-two-page-right-to-left") {
    return Math.min(widthScale, heightScale);
  }
  return 1;
}

export function computeImageScale(input: ComputeImageScaleInput): number {
  if (
    !validDimension(input.imageWidth) ||
    !validDimension(input.imageHeight) ||
    !validDimension(input.viewportWidth) ||
    !validDimension(input.viewportHeight)
  ) {
    return clampScale(input.userZoom || 1);
  }

  if (input.viewMode === "webtoon") {
    return clampScale(input.userZoom || 1);
  }

  let baseScale = input.viewMode === "original" ? 1 : fitBaseScale(input);
  if (!input.upscaleSmallImages) {
    baseScale = Math.min(1, baseScale);
  }

  return clampScale(baseScale * (input.userZoom || 1));
}

export function imageRenderingClass(interpolationFilter: string): string {
  return interpolationFilter === "nearest" ? "interpolation-nearest" : `interpolation-${interpolationFilter}`;
}

export function filterPresetClass(filterPreset: string): string {
  return `filter-${filterPreset}`;
}

