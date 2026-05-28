export default defineNuxtConfig({
  compatibilityDate: "2026-05-21",
  devtools: { enabled: true },

  modules: [
    "@nuxt/ui",
    "@nuxt/eslint",
    "@pinia/nuxt",
    "@nuxtjs/i18n",
    "@vueuse/nuxt",
  ],

  css: ["@/css/main.css", "@/css/main.scss"],

  // Nuxt auto-imports every `app/components/**` file with a path-derived prefix —
  // `app/components/ui/Button.vue` becomes `<UiButton>`, etc. No explicit
  // `components:` config needed. Nuxt UI's stock components keep the `<U*>` prefix
  // (`<UButton>`); ours pick up the `<Ui*>` prefix from the `ui/` folder name.

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
  },

  runtimeConfig: {
    public: {
      apiBaseUrl: "https://jsonplaceholder.typicode.com",
      appName: "PRISM_APP",
      languageCode: "en",
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
});
