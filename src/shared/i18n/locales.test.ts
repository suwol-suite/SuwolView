import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import ko from "./locales/ko.json";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      return flattenKeys(nestedValue, nextKey);
    }
    return nextKey;
  });
}

function emptyStringKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      return emptyStringKeys(nestedValue, nextKey);
    }
    return typeof nestedValue === "string" && nestedValue.trim() === "" ? [nextKey] : [];
  });
}

describe("i18n locales", () => {
  it("keeps Korean and English translation keys aligned", () => {
    expect(flattenKeys(ko).sort()).toEqual(flattenKeys(en).sort());
  });

  it("does not include empty translation strings", () => {
    expect(emptyStringKeys(en)).toEqual([]);
    expect(emptyStringKeys(ko)).toEqual([]);
  });
});
