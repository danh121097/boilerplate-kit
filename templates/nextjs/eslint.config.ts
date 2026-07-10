import sortLeadingDeclarations from "./eslint-rules/sort-leading-declarations";
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
  { ignores: [".next/", "node_modules/", "next-env.d.ts", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      // Type-aware linting so local/sort-leading-declarations can tell a value
      // binding from a function binding. `**/*.ts(x)` is covered by tsconfig;
      // the lone .mjs config falls back to the default inferred project.
      parserOptions: { projectService: { allowDefaultProject: ["postcss.config.mjs"] } },
    },
    plugins: {
      perfectionist,
      "react-hooks": reactHooks,
      local: { rules: { "sort-leading-declarations": sortLeadingDeclarations } },
    },
    rules: {
      "perfectionist/sort-imports": sortImportsByKind,
      // Group each function's leading declarations: let -> const -> destructuring.
      "local/sort-leading-declarations": "warn",
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
