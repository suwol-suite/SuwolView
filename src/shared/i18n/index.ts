import i18next, { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultLanguage, fallbackLanguage } from "./languages";
import en from "./locales/en.json";
import ko from "./locales/ko.json";

export const resources = {
  ko: {
    translation: ko
  },
  en: {
    translation: en
  }
} as const;

export function createSuwolI18n(initialLanguage = defaultLanguage) {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: fallbackLanguage,
    interpolation: {
      escapeValue: false
    },
    returnNull: false
  });
  return instance;
}

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources,
    lng: defaultLanguage,
    fallbackLng: fallbackLanguage,
    interpolation: {
      escapeValue: false
    },
    returnNull: false
  });
}

export default i18next;
