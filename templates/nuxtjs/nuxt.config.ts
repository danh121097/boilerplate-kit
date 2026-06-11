import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-05-21",
  devtools: { enabled: true },

  // Default dev port — sidesteps the crowded port 3000 (Express/Bun/Next default).
  devServer: { port: 4321 },

  modules: ["@nuxt/eslint", "@pinia/nuxt", "@nuxtjs/i18n", "@vueuse/nuxt"],

  css: ["@/css/main.css", "@/css/main.scss"],

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
    defaultLocale: "en",
    strategy: "no_prefix",
    lazy: true,
    locales: [
      { code: "en", file: "en.ts" },
      { code: "ja", file: "ja.ts" },
    ],
    // Persist the chosen locale under the namespaced LANGUAGE key (mirrors
    // STORAGE_KEYS.LANGUAGE = `${APP_NAME}_LANGUAGE`) instead of the default
    // `i18n_redirected`, so the app's storage keys stay consistent.
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: `${process.env.NUXT_PUBLIC_APP_NAME}_LANGUAGE`,
      redirectOn: "root",
    },
  },

  runtimeConfig: {
    public: {
      apiBaseUrl: "",
      appEndpoint: "",
      appName: "",
      languageCode: "en",
      hmacSecret: "",
      buildVersion: "1.0.0",
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
});
