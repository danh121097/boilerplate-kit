import { STORAGE_KEYS } from "@/enums";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ja from "./locales/ja";
import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";

function getSavedLanguage(): string {
  try {
    if (typeof localStorage !== "undefined") {
      return (
        localStorage.getItem(STORAGE_KEYS.LANGUAGE) || process.env.NEXT_PUBLIC_LANGUAGE_CODE || "en"
      );
    }
  } catch {
    // localStorage unavailable (private browsing strict mode) — ignore
  }
  return process.env.NEXT_PUBLIC_LANGUAGE_CODE || "en";
}

const i18n = i18next.use(LanguageDetector).use(initReactI18next);

export function initI18n(): typeof i18next {
  void i18n.init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: getSavedLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: { order: [], lookupLocalStorage: STORAGE_KEYS.LANGUAGE }, // locale detection handled via STORAGE_KEYS
  });
  return i18next;
}

/** Switch locale and persist to localStorage (SSR-guarded). */
export function setLocale(locale: "en" | "ja"): void {
  void i18next.changeLanguage(locale);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, locale);
    }
  } catch {
    // localStorage unavailable — ignore
  }
}

export type AppLocale = "en" | "ja";
export default i18n;
