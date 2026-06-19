import { STORAGE_KEYS } from "@/enums";
import { readCookie, writeCookie } from "@/utils";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";
import i18next from "i18next";

/** Client fallback: read the saved locale from the LANGUAGE cookie (a Server
 * Component passes `initialLanguage` from `next/headers` instead). */
function getSavedLanguage(): string {
  return readCookie(STORAGE_KEYS.LANGUAGE) || process.env.NEXT_PUBLIC_LANGUAGE_CODE || "en";
}

const i18n = i18next.use(initReactI18next);

/**
 * Initialize i18next. `initialLanguage` is the locale the root layout resolved on
 * the server from the LANGUAGE cookie, so SSR renders the right language with no
 * flash; on the client it falls back to the cookie via `document.cookie`.
 */
export function initI18n(initialLanguage?: string): typeof i18next {
  void i18n.init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: initialLanguage || getSavedLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return i18next;
}

/** Switch locale and persist to the LANGUAGE cookie (so SSR reads it next load). */
export function setLocale(locale: "en" | "ja"): void {
  void i18next.changeLanguage(locale);
  writeCookie(STORAGE_KEYS.LANGUAGE, locale);
}

export type AppLocale = "en" | "ja";
export default i18n;
