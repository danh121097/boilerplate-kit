import { getLocales } from "expo-localization";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";
import i18next from "i18next";

export type AppLocale = "en" | "ja";

const SUPPORTED: readonly AppLocale[] = ["en", "ja"];

/**
 * Detect the initial language from the device locale (via `expo-localization`,
 * replacing the web template's `i18next-browser-languagedetector`), falling back
 * to `EXPO_PUBLIC_LANGUAGE_CODE` then `en`.
 */
function detectLanguage(): AppLocale {
  const deviceCode = getLocales()[0]?.languageCode ?? "";
  if (SUPPORTED.includes(deviceCode as AppLocale)) return deviceCode as AppLocale;
  const envCode = process.env.EXPO_PUBLIC_LANGUAGE_CODE;
  if (envCode && SUPPORTED.includes(envCode as AppLocale)) return envCode as AppLocale;
  return "en";
}

export function initI18n(): typeof i18next {
  void i18next.use(initReactI18next).init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: detectLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    // Detection handled above via expo-localization; no browser detector plugin.
  });
  return i18next;
}

/** Switch locale at runtime. Persist to your own storage if you need it to stick
 * across launches (the starter re-detects from the device on each boot). */
export function setLocale(locale: AppLocale): void {
  void i18next.changeLanguage(locale);
}

export default i18next;
