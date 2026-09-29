import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { ReactElement } from "react";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";
import i18next from "i18next";

/** A fresh i18n instance (en + ja bundles), initialised before it is returned. */
export async function makeI18n(lng: "en" | "ja" = "en") {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return instance;
}

/** Server-render `element` inside an i18n provider — no DOM needed. */
export async function renderWithI18n(element: ReactElement, lng: "en" | "ja" = "en") {
  const i18n = await makeI18n(lng);
  return renderToString(createElement(I18nextProvider, { i18n }, element));
}
