import type { AppLanguageSetting, LanguageCode, LanguageOption } from "./types";

export const defaultLanguage: LanguageCode = "en";
export const fallbackLanguage: LanguageCode = "en";
export const builtInLanguages = ["ko", "en"] as const satisfies readonly LanguageCode[];

export const languageOptions: readonly LanguageOption[] = [
  {
    code: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    labelKey: "languages.ko"
  },
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    labelKey: "languages.en"
  }
];

const languageCodeSet = new Set<string>(builtInLanguages);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && languageCodeSet.has(value);
}

export function isAppLanguageSetting(value: unknown): value is AppLanguageSetting {
  return value === "system" || isLanguageCode(value);
}

export function normalizeLanguagePreference(value: unknown): AppLanguageSetting {
  return isAppLanguageSetting(value) ? value : "system";
}

export function normalizeLocaleCode(locale: string | undefined): LanguageCode | undefined {
  if (!locale) return undefined;
  const normalized = locale.trim().toLowerCase().replace("_", "-");
  const [language] = normalized.split("-");
  return isLanguageCode(language) ? language : undefined;
}

export function resolveAppLanguage(
  setting: AppLanguageSetting,
  systemLocales: readonly string[] = []
): LanguageCode {
  if (isLanguageCode(setting)) {
    return setting;
  }

  for (const locale of systemLocales) {
    const language = normalizeLocaleCode(locale);
    if (language) {
      return language;
    }
  }

  return fallbackLanguage;
}
