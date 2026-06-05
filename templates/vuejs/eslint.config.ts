import autoImport from "./.eslintrc-auto-import.json" with { type: "json" };
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

// Order imports by syntax kind, not by source path:
//   1. named value imports   -> import { X } from "x"
//   2. type imports          -> import type { X } from "x"
//   3. default imports        -> import X from "x"
//   4. side-effect imports    -> import "x"
// Custom groups outrank predefined groups, so the kind order is authoritative.
const sortImportsByKind = [
  "warn",
  {
    type: "alphabetical",
    order: "asc",
    newlinesBetween: "ignore",
    groups: ["named-value", "type-import", "default-import", "side-effect"],
    customGroups: [
      { groupName: "named-value", modifiers: ["named", "value"] },
      { groupName: "type-import", selector: "type" },
      { groupName: "default-import", modifiers: ["default"] },
      { groupName: "side-effect", selector: "side-effect" },
    ],
  },
];

// unplugin-auto-import injects composables/utilities (ref, computed, cn, ...) as
// globals; register them so .vue/.ts files don't trip `no-undef`.
const autoImportGlobals = Object.fromEntries(
  Object.keys(autoImport.globals).map((name) => [name, "readonly"]),
);

export default [
  { ignores: ["dist/", "auto-imports.d.ts", "components.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    // Parse <script lang="ts"> blocks in .vue with the TypeScript parser.
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...autoImportGlobals } },
    plugins: { perfectionist },
    rules: {
      "perfectionist/sort-imports": sortImportsByKind,
      "vue/multi-word-component-names": "off",
      // UI components intentionally render trusted HTML (e.g. validation messages).
      "vue/no-v-html": "off",
      // Let Prettier own HTML tag formatting (self-closing on void elements).
      "vue/html-self-closing": "off",
      // Optional props default to `undefined` implicitly — no explicit default needed.
      "vue/require-default-prop": "off",
    },
  },
  prettier,
];
