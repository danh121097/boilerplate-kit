import { existsSync, readFileSync } from "node:fs";
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
  { ignores: ["dist/", ".output/", ".nitro/", "src/routeTree.gen.ts", "auto-imports.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...autoImportGlobals } },
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
