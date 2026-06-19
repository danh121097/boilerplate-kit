import { STORAGE_KEYS } from "@/enums";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";
import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";

function getSavedLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || import.meta.env.VITE_LANGUAGE_CODE || "en";
  } catch {
    return import.meta.env.VITE_LANGUAGE_CODE || "en";
  }
}

const i18n = i18next
  .use(LanguageDetector)
  .use(initReactI18next);

export function initI18n(): typeof i18next {
  void i18n.init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: getSavedLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: { order: [] }, // we handle detection ourselves via STORAGE_KEYS
  });
  return i18next;
}

/** Switch locale and persist to localStorage. */
export function setLocale(locale: "en" | "ja"): void {
  void i18next.changeLanguage(locale);
  try {
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, locale);
  } catch {
    // localStorage unavailable (e.g. private browsing strict mode) — ignore
  }
}

export type AppLocale = "en" | "ja";
export default i18n;
