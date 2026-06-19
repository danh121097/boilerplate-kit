import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import perfectionist from "eslint-plugin-perfectionist";
import eslintConfigPrettier from "eslint-config-prettier";

// Order imports by syntax kind, not by source path:
//   1. named value imports   -> import { X } from "x"
//   2. type imports          -> import type { X } from "x"
//   3. default imports        -> import X from "x"
//   4. side-effect imports    -> import "x"
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
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: { perfectionist },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "warn",
      // NestJS DI relies on parameter decorators + class metadata; these are noisy here.
      "@typescript-eslint/no-extraneous-class": "off",
      "perfectionist/sort-imports": sortImportsByKind,
    },
  },
  {
    files: ["src/**/*.spec.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  },
  eslintConfigPrettier,
);
