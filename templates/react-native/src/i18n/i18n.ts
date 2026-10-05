import { STORAGE_KEYS } from "@/enums";
import { getAppStorage } from "@/services/core/app-storage";
import { getLocales } from "expo-localization";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";
import i18next from "i18next";

export type AppLocale = "en" | "ja";

const SUPPORTED: readonly AppLocale[] = ["en", "ja"];

function isAppLocale(code: unknown): code is AppLocale {
  return SUPPORTED.includes(code as AppLocale);
}

/**
 * Startup language when nothing is saved yet: the device locale (via
 * `expo-localization`, replacing the web template's browser language detector),
 * then `EXPO_PUBLIC_LANGUAGE_CODE`, then `en`. A saved choice beats all of
 * these (see `restoreSavedLanguage`).
 */
export function detectLanguage(): AppLocale {
  const deviceCode = getLocales()[0]?.languageCode;
  if (isAppLocale(deviceCode)) return deviceCode;
  const envCode = process.env.EXPO_PUBLIC_LANGUAGE_CODE;
  if (isAppLocale(envCode)) return envCode;
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
  void restoreSavedLanguage();
  return i18next;
}

/** Apply the language saved by `setLocale`, if any. Storage failures are ignored
 * (the device / env / `en` startup language stays). */
export async function restoreSavedLanguage(): Promise<void> {
  try {
    const saved = getAppStorage().getString(STORAGE_KEYS.LANGUAGE);
    if (isAppLocale(saved) && saved !== i18next.language) await i18next.changeLanguage(saved);
  } catch {
    // Keep the detected language.
  }
}

/** Switch locale at runtime and persist it under `STORAGE_KEYS.LANGUAGE`, so it
 * sticks across launches (saved > device > env > en). */
export async function setLocale(locale: AppLocale): Promise<void> {
  await i18next.changeLanguage(locale);
  try {
    getAppStorage().set(STORAGE_KEYS.LANGUAGE, locale);
  } catch {
    // The switch applies for this session even if it cannot be saved.
  }
}

export default i18next;
