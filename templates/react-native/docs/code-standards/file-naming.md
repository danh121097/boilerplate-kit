# File Naming

## Rules

| Kind | Convention | Example |
|------|-----------|---------|
| TypeScript modules | kebab-case | `auth-token-storage.ts` |
| React Native screens | kebab-case file, PascalCase export | `profile-screen.tsx` → `export function ProfileScreen` |
| UI primitives | kebab-case file, PascalCase export | `form-field.tsx` → `export const FormField` |
| React hooks | camelCase (`useXxx.ts`) | `useAppVersion.ts` |
| Test files | `kebab-case.test.ts` | `hmac-signature.test.ts` |
| Expo Router files | kebab-case under `app/` | `home.tsx`, `_layout.tsx`, `login.tsx` |
| Route groups | parentheses around group name | `(auth)`, `(app)` |
| Store files | `kebab-case.ts` | `auth.ts`, `socket-io.ts` |

## Rationale

kebab-case is self-documenting for LLM grep/glob tools. The `useXxx.ts` hook
exception matches the exported function name exactly, which avoids a mismatch
between filename and symbol that would confuse tooling.

## Paths

All imports use the `@/` alias — never relative `../../`. Barrel `index.ts`
files exist for every multi-file directory.
