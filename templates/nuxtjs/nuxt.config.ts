import { mockAuthPublicConfig } from "./config/mock-auth-public-config";
import tailwindcss from "@tailwindcss/vite";

// Locale used when neither the saved cookie nor the browser language picks one.
// `NUXT_PUBLIC_LANGUAGE_CODE` (en | ja) is read at build time, like the cookie key.
const DEFAULT_LOCALE = process.env.NUXT_PUBLIC_LANGUAGE_CODE === "ja" ? "ja" : "en";

export default defineNuxtConfig({
  compatibilityDate: "2026-05-21",
  devtools: { enabled: true },

  // Default dev port — sidesteps the crowded port 3000 (Express/Bun/Next default).
  devServer: { port: 4321 },

  modules: ["@nuxt/eslint", "@pinia/nuxt", "@nuxtjs/i18n", "@vueuse/nuxt"],

  css: ["@/css/main.css", "@/css/main.scss"],

  app: {
    baseURL: "/",
    head: {
      htmlAttrs: { lang: "en" },
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      title: "Nuxt.js Starter",
      meta: [
        {
          name: "description",
          content: "Nuxt.js Starter project with TypeScript, Pinia, i18n, and TailwindCSS.",
        },
      ],
      link: [],
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  // Nuxt auto-imports every `app/components/**` file with a path-derived prefix —
  // `app/components/ui/Button.vue` becomes `<UiButton>`, etc. No explicit
  // `components:` config needed.

  // @pinia/nuxt: keep stores EXPLICIT — never auto-import.
  // Empty storesDirs disables the auto-import scanner per project convention.
  pinia: {
    storesDirs: [],
  },

  i18n: {
    defaultLocale: DEFAULT_LOCALE,
    strategy: "no_prefix",
    lazy: true,
    locales: [
      { code: "en", file: "en.ts" },
      { code: "ja", file: "ja.ts" },
    ],
    // Persist the chosen locale under the namespaced LANGUAGE key (mirrors
    // STORAGE_KEYS.LANGUAGE = `${APP_NAME}_LANGUAGE`) instead of the default
    // `i18n_redirected`, so the app's storage keys stay consistent. Order:
    // saved cookie > browser language > `DEFAULT_LOCALE` > en.
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: `${process.env.NUXT_PUBLIC_APP_NAME}_LANGUAGE`,
      fallbackLocale: DEFAULT_LOCALE,
      redirectOn: "root",
    },
  },

  runtimeConfig: {
    public: {
      appEndpoint: "",
      apiPrefix: "/api/v1",
      appName: "",
      languageCode: DEFAULT_LOCALE,
      hmacSecret: "",
      buildVersion: "1.0.0",
      // Session hint cookie lifetime in days; match the backend's JWT_REFRESH_EXPIRY.
      sessionHintMaxAgeDays: 7,
      // Dev-only mock auth (see services/auth/data/mock-auth.ts). Off unless "true"/"1";
      // the keys are not declared at all in a production build.
      ...mockAuthPublicConfig(process.env.NODE_ENV === "production"),
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
    // Nuxt's generated tsconfig already sets noUncheckedIndexedAccess and
    // verbatimModuleSyntax; stated here so the baseline shared with the other
    // templates is explicit. Applies to the app tsconfig, not tsconfig.server.json.
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        noFallthroughCasesInSwitch: true,
        verbatimModuleSyntax: true,
      },
    },
  },
});
