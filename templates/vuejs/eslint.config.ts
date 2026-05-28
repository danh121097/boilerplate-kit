import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["dist/", "auto-imports.d.ts", "components.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];
