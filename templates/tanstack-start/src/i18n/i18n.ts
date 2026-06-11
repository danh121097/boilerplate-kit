import { STORAGE_KEYS } from "@/enums";
import { readCookie, writeCookie } from "@/utils";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ja from "./locales/ja";
import i18next from "i18next";

/**
 * Read the saved locale from the LANGUAGE cookie — isomorphically. On the server
 * the cookie comes from the request (`getCookie`); on the client from
 * `document.cookie`. Storing the locale in a cookie (not localStorage) lets SSR
 * resolve the right language on first paint, so no flash and no hydration drift.
 */
const readLanguageCookie = createIsomorphicFn()
  .server(() => {
    try {
      return getCookie(STORAGE_KEYS.LANGUAGE) ?? null;
    } catch {
      // Outside a Start request scope (e.g. a unit test) — no cookie to read.
      return null;
    }
  })
  .client(() => readCookie(STORAGE_KEYS.LANGUAGE));

function getSavedLanguage(): string {
  return readLanguageCookie() || import.meta.env.VITE_LANGUAGE_CODE || "en";
}

const i18n = i18next.use(initReactI18next);

export function initI18n(): typeof i18next {
  void i18n.init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: getSavedLanguage(),
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
