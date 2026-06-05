import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
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

export default tseslint.config(
  {
    // Global ignores. Lint only CLI source + tests + root config files;
    // skip everything else (templates, plans, .claude tooling, release manifests, etc.).
    ignores: [
      "**/*",
      "!src/**",
      "!tests/**",
      "!*.ts",
      "!*.mjs",
      "dist/**",
      "node_modules/**",
      "templates/**",
      "coverage/**",
      ".tsup/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { perfectionist },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { console: "readonly", process: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "perfectionist/sort-imports": sortImportsByKind,
    },
  },
  prettier,
);
