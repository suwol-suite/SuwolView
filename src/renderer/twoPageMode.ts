import type { ImageViewMode, LibraryItem } from "../shared/types";

export function isTwoPageMode(viewMode: ImageViewMode): boolean {
  return viewMode === "smart-two-page-left-to-right" || viewMode === "smart-two-page-right-to-left";
}

export function selectTwoPageItems(
  items: readonly LibraryItem[],
  currentIndex: number,
  viewMode: ImageViewMode
): LibraryItem[] {
  const current = items[currentIndex];
  if (!current || !isTwoPageMode(viewMode)) return current ? [current] : [];

  const next = items[currentIndex + 1];
  const pages = next ? [current, next] : [current];
  return viewMode === "smart-two-page-right-to-left" ? [...pages].reverse() : pages;
}

export function selectWebtoonItems(items: readonly LibraryItem[]): LibraryItem[] {
  return [...items].sort((left, right) => left.index - right.index);
}
