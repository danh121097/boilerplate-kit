# File Naming

## Rules

| Kind | Convention | Example |
|------|-----------|---------|
| TypeScript modules | kebab-case | `auth-token-storage.ts` |
| React components | kebab-case file, PascalCase export | `form-field.tsx` → `export function FormField` |
| React hooks | camelCase (`useXxx.ts`) | `useAppVersion.ts` |
| Test files | `kebab-case.test.ts` | `hmac-signature.test.ts` |
| Route files | kebab-case under `src/routes/` | `counter.tsx`, `__root.tsx` |
| Store files | `kebab-case.ts` | `counter.ts` |

## Rationale

kebab-case is self-documenting for LLM grep/glob tools. The `useXxx.ts` hook
exception matches the exported function name exactly, which avoids a mismatch
between filename and symbol that would confuse tooling.

## Paths

All imports use the `@/` alias — never relative `../../`. Barrel `index.ts`
files exist for every multi-file directory.
