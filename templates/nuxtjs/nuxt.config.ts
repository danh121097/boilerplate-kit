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

  css: ["~/assets/css/main.css", "~/assets/css/main.scss"],

  // Auto-register only ~/components/ui as global. Other components stay explicit imports.
  components: [{ path: "~/components/ui", global: true, pathPrefix: false }],

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
