import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../shared/types";
import { selectTwoPageItems, selectWebtoonItems } from "./twoPageMode";

function item(index: number): LibraryItem {
  return {
    id: `item-${index}`,
    sourceId: "source",
    sourceKind: "folder",
    name: `${index}.png`,
    extension: "png",
    index,
    support: {
      extension: "png",
      level: "native",
      label: "PNG",
      mimeType: "image/png"
    },
    displayUrl: `suwol-image://display/${index}`,
    thumbnailUrl: `suwol-image://thumbnail/${index}`
  };
}

describe("two-page mode", () => {
  const items = [item(0), item(1), item(2)];

  it("orders pages left-to-right", () => {
    expect(selectTwoPageItems(items, 0, "smart-two-page-left-to-right").map((entry) => entry.index)).toEqual([0, 1]);
  });

  it("orders pages right-to-left", () => {
    expect(selectTwoPageItems(items, 0, "smart-two-page-right-to-left").map((entry) => entry.index)).toEqual([1, 0]);
  });

  it("shows only the last page when there is no pair", () => {
    expect(selectTwoPageItems(items, 2, "smart-two-page-left-to-right").map((entry) => entry.index)).toEqual([2]);
  });

  it("keeps webtoon mode in vertical sequence", () => {
    expect(selectWebtoonItems([items[2], items[0], items[1]]).map((entry) => entry.index)).toEqual([0, 1, 2]);
  });
});
