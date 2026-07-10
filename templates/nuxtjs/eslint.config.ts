import withNuxt from "./.nuxt/eslint.config.mjs";
import sortSetupDeclarations from "./eslint-rules/sort-setup-declarations";
import perfectionist from "eslint-plugin-perfectionist";

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

export default withNuxt(
  {
    plugins: { perfectionist },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-v-html": "off",
      "vue/html-self-closing": "off",
      "vue/require-default-prop": "off",
      "perfectionist/sort-imports": sortImportsByKind,
    },
  },
  {
    // The service layer intentionally uses static-only classes: `Model` is a base
    // class subclasses extend, and the utils expose namespaced static helpers.
    files: ["app/services/core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    // Role-order declarations in <script setup> AND function bodies (composables,
    // Pinia setup stores): props → composables → const → ref → computed → functions.
    files: ["**/*.vue", "**/*.ts"],
    plugins: { local: { rules: { "sort-setup-declarations": sortSetupDeclarations } } },
    rules: { "local/sort-setup-declarations": "warn" },
  },
);
