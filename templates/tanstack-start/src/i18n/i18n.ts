import { STORAGE_KEYS } from "@/enums";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ja from "./locales/ja";
import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";

/**
 * SSR-safe language read: localStorage is browser-only; on the server fall back
 * to the VITE_LANGUAGE_CODE env var or "en". This is called at module init in
 * client.tsx — on the server the i18n instance is initialized in ssr.tsx without
 * localStorage access.
 */
function getSavedLanguage(): string {
  try {
    if (typeof window === "undefined") {
      return import.meta.env.VITE_LANGUAGE_CODE || "en";
    }
    return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || import.meta.env.VITE_LANGUAGE_CODE || "en";
  } catch {
    return import.meta.env.VITE_LANGUAGE_CODE || "en";
  }
}

const i18n = i18next.use(LanguageDetector).use(initReactI18next);

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

/** Switch locale and persist to localStorage (client-only). */
export function setLocale(locale: "en" | "ja"): void {
  void i18next.changeLanguage(locale);
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, locale);
    }
  } catch {
    // localStorage unavailable (e.g. private browsing strict mode) — ignore
  }
}

export type AppLocale = "en" | "ja";
export default i18n;
