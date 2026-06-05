import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    AutoImport({
      imports: ["vue", "vue-router", "@vueuse/core", "vue-i18n", "pinia"],
      dts: "auto-imports.d.ts",
      dirs: ["./src/composables/**", "./src/utils/**"],
      vueTemplate: true,
      eslintrc: { enabled: true, filepath: "./.eslintrc-auto-import.json" },
    }),
    Components({
      // Auto-register components only from `src/components/ui/`. Feature-specific
      // components live elsewhere (e.g. `src/components/<feature>/`) and stay
      // explicit imports so the global registry doesn't grow unbounded.
      dirs: ["./src/components/ui"],
      dts: "components.d.ts",
      directoryAsNamespace: false,
      extensions: ["vue"],
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
