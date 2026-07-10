import { existsSync, readFileSync } from "node:fs";
import sortSetupDeclarations from "./eslint-rules/sort-setup-declarations";
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
// .eslintrc-auto-import.json is gitignored (written on dev/build) — read it only
// if present so a fresh checkout can lint before the first build.
const autoImportFile = "./.eslintrc-auto-import.json";
const autoImportGlobals = existsSync(autoImportFile)
  ? Object.fromEntries(
      Object.keys(JSON.parse(readFileSync(autoImportFile, "utf8")).globals).map((name) => [
        name,
        "readonly",
      ]),
    )
  : {};

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
    plugins: {
      perfectionist,
      // Role-order declarations in <script setup> AND function bodies (composables,
      // Pinia setup stores): props → composables → const → ref → computed → functions.
      local: { rules: { "sort-setup-declarations": sortSetupDeclarations } },
    },
    rules: {
      "perfectionist/sort-imports": sortImportsByKind,
      "local/sort-setup-declarations": "warn",
      "vue/multi-word-component-names": "off",
      "vue/no-v-html": "off",
      "vue/html-self-closing": "off",
      "vue/require-default-prop": "off",
    },
  },
  prettier,
];
