# File Naming

## Rules

| Kind | Convention | Example |
|------|-----------|---------|
| TypeScript modules | kebab-case | `hmac-signature.ts`, `query-keys.ts` |
| React components | kebab-case file, PascalCase export | `form-field.tsx` → `export function FormField` |
| React hooks | camelCase (`useXxx.ts`) | `useSocketIO.ts` |
| App Router files | Next.js reserved names inside segment folders | `app/users/page.tsx`, `app/layout.tsx` |
| Client islands next to a page | kebab-case | `app/users/users-list-client.tsx` |
| Server-only helpers | kebab-case under `src/server/` | `server-api.ts`, `session.ts` |
| Store files | kebab-case | `counter.ts`, `socket-io.ts` |
| Test files | `kebab-case.test.ts` under `src/__tests__/{unit,integration}/` | `hmac-signature.test.ts` |

## Rationale

kebab-case is self-documenting for LLM grep/glob tools. The `useXxx.ts` hook
exception matches the exported function name exactly, which avoids a mismatch
between filename and symbol that would confuse tooling. App Router names
(`page.tsx`, `layout.tsx`) are fixed by Next.js.

## Paths

All imports use the `@/` alias (maps to `src/`) — never relative `../../`.
Multi-file service folders expose a barrel `index.ts`
(`import { useUsersListQuery } from "@/services/users"`).
