import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

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
    },
  },
  prettier,
);
