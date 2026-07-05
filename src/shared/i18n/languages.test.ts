import { describe, expect, it } from "vitest";
import {
  builtInLanguages,
  defaultLanguage,
  fallbackLanguage,
  isAppLanguageSetting,
  languageOptions,
  normalizeLanguagePreference,
  resolveAppLanguage
} from "./languages";

describe("i18n languages", () => {
  it("declares the built-in language list and defaults", () => {
    expect(defaultLanguage).toBe("en");
    expect(fallbackLanguage).toBe("en");
    expect(builtInLanguages).toEqual(["ko", "en"]);
    expect(languageOptions.map((language) => language.code)).toEqual(["ko", "en"]);
  });

  it("resolves system locales to supported languages", () => {
    expect(resolveAppLanguage("system", ["ko-KR", "en-US"])).toBe("ko");
    expect(resolveAppLanguage("system", ["en-US"])).toBe("en");
    expect(resolveAppLanguage("system", ["fr-FR"])).toBe("en");
  });

  it("keeps fixed language settings and normalizes invalid settings", () => {
    expect(resolveAppLanguage("ko", ["en-US"])).toBe("ko");
    expect(resolveAppLanguage("en", ["ko-KR"])).toBe("en");
    expect(isAppLanguageSetting("system")).toBe(true);
    expect(isAppLanguageSetting("ko")).toBe(true);
    expect(isAppLanguageSetting("fr")).toBe(false);
    expect(normalizeLanguagePreference("fr")).toBe("system");
  });
});
