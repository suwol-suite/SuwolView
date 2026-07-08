import { describe, expect, it } from "vitest";
import { computeImageScale, imageRenderingClass } from "./viewerLayout";

const baseInput = {
  imageWidth: 400,
  imageHeight: 200,
  viewportWidth: 1000,
  viewportHeight: 500,
  upscaleSmallImages: true,
  userZoom: 1
};

describe("viewer layout", () => {
  it("calculates fit-window scale", () => {
    expect(computeImageScale({ ...baseInput, viewMode: "fit-window" })).toBe(2.5);
  });

  it("calculates fit-width scale", () => {
    expect(computeImageScale({ ...baseInput, viewMode: "fit-width" })).toBe(2.5);
  });

  it("calculates fit-height scale", () => {
    expect(computeImageScale({ ...baseInput, viewMode: "fit-height" })).toBe(2.5);
  });

  it("calculates original scale", () => {
    expect(computeImageScale({ ...baseInput, viewMode: "original", userZoom: 1 })).toBe(1);
  });

  it("prevents fit-mode upscaling when disabled", () => {
    expect(computeImageScale({ ...baseInput, viewMode: "fit-window", upscaleSmallImages: false })).toBe(1);
  });

  it("allows fit-mode upscaling when enabled", () => {
    expect(computeImageScale({ ...baseInput, viewMode: "fit-window", upscaleSmallImages: true })).toBe(2.5);
  });

  it("maps nearest interpolation to a pixelated class", () => {
    expect(imageRenderingClass("nearest")).toBe("interpolation-nearest");
  });
});
