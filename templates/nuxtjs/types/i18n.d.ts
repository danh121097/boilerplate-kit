import type en from "../i18n/locales/en";

/**
 * Strongly-type vue-i18n's message catalog using the `en` locale as the source
 * of truth. `t("nav.home")` autocompletes; typos surface as TS errors.
 *
 * Add new locales by keeping their key shape identical to `en.ts`.
 */
// An interface's `extends` clause needs a named type, not a `typeof` query —
// so alias the locale's inferred shape first.
type LocaleMessageSchema = typeof en;

declare module "vue-i18n" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends LocaleMessageSchema {}
}

export {};
