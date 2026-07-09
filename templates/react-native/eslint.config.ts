import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Order imports by syntax kind, not by source path:
//   1. named value imports   -> import { X } from "x"
//   2. type imports          -> import type { X } from "x"
//   3. default imports       -> import X from "x"
//   4. side-effect imports   -> import "x"
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

export default [
  {
    ignores: [
      "dist/",
      ".expo/",
      "expo-env.d.ts",
      // babel/metro must stay .js (Expo/Metro read them directly); not linted.
      "babel.config.js",
      "metro.config.js",
      // TS configs loaded by jiti/ts-node — skip type-aware/module churn on them.
      "jest.config.ts",
      "tailwind.config.ts",
      "prettier.config.ts",
      "eslint.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Jest mock factories (`jest.mock(..., () => require(...))`) legitimately use
    // require — allow it only in test files.
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // React Native ships browser-like globals (fetch, console, setTimeout) plus
    // its own `__DEV__` flag; test files add the Jest globals.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.jest, __DEV__: "readonly" },
    },
    plugins: { perfectionist, "react-hooks": reactHooks },
    rules: {
      "perfectionist/sort-imports": sortImportsByKind,
      ...reactHooks.configs.recommended.rules,
      // Allow underscore-prefixed params/vars to be unused (e.g. _wrapperClassName omit-props).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  prettier,
];
