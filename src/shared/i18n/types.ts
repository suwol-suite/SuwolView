export type LanguageCode = "ko" | "en";
export type AppLanguageSetting = "system" | LanguageCode;

export interface LocaleInfo {
  locale: string;
  preferredSystemLanguages: string[];
}

export interface LanguageOption {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  labelKey: `languages.${LanguageCode}`;
}

export type TranslationResource = Record<string, unknown>;
