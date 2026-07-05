import { resolveAppLanguage } from "./languages";
import en from "./locales/en.json";
import ko from "./locales/ko.json";
import type { AppLanguageSetting, LanguageCode, LocaleInfo, TranslationResource } from "./types";

const localeResources: Record<LanguageCode, TranslationResource> = {
  ko,
  en
};

function readNestedString(resource: TranslationResource, key: string): string | undefined {
  let value: unknown = resource;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === "string" ? value : undefined;
}

export function translateKey(language: LanguageCode, key: string): string {
  return readNestedString(localeResources[language], key) ?? readNestedString(localeResources.en, key) ?? key;
}

export function resolveLanguageSetting(setting: AppLanguageSetting, localeInfo: LocaleInfo): LanguageCode {
  return resolveAppLanguage(setting, [localeInfo.locale, ...localeInfo.preferredSystemLanguages]);
}
