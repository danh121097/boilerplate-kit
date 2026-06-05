import { STORAGE_KEYS } from "@/enums";
import { createI18n } from "vue-i18n";
import type { App } from "vue";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";

function getLanguage(): string {
  return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || import.meta.env.VITE_LANGUAGE_CODE || "en";
}

function createI18nInstance() {
  return createI18n({
    legacy: false as const,
    messages: { en, ja },
    locale: getLanguage(),
    fallbackLocale: "en",
    warnHtmlMessage: false,
    missingWarn: false,
  });
}

type I18nGlobal = ReturnType<typeof createI18nInstance>["global"];

/** Narrow locale to the bundled message keys — inferred straight from the instance. */
export type Locale = I18nGlobal["locale"]["value"];

let i18n: I18nGlobal | null = null;

export function installI18n(app: App) {
  const instance = createI18nInstance();
  app.use(instance);
  i18n = instance.global;
}

export function setLocale(locale: Locale) {
  if (!i18n) return;
  i18n.locale.value = locale;
  localStorage.setItem(STORAGE_KEYS.LANGUAGE, locale);
}
