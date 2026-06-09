# Conventions

## File naming

- `.ts` / `.tsx` files: kebab-case (e.g. `counter.ts`, `form-field.tsx`).
- Hooks: `useXxx.ts` camelCase (exception to kebab-case — matches function name).
- Components: PascalCase display name inside the file; kebab-case filename (e.g. `button.tsx` exports `Button`).
- Test files: `kebab-case.test.ts` co-located under `src/__tests__/`.

## Import alias

All imports use the `@/` alias pointing to `src/`. Never use relative `../../` chains.

```ts
import { cn } from "@/lib/utils";
import { useCounterStore } from "@/stores/counter";
```

## Barrel exports

Every directory with multiple modules has an `index.ts` barrel. Import from the
barrel, not the leaf file, unless you need a specific internal symbol in a test.

## React component conventions

- Functional components only; no class components.
- Props interface extracted above `function` declaration — never inline object type.
- `forwardRef` for UI primitives (Button, Input, FormField) so form libraries can attach refs.
- No default export for components — use named exports.

## Stores

Import Zustand stores explicitly:

```ts
import { useCounterStore } from "@/stores/counter";
```

Never rely on auto-import or global registration.

## i18n

- Locale keys in `src/i18n/locales/en.ts` and `ja.ts` (typed `as const`).
- Access via `useTranslation()` hook from react-i18next.
- Persisted locale stored in `STORAGE_KEYS.LANGUAGE`.
- Switch locale via `setLocale()` from `@/i18n/i18n`.

## Commits

Conventional Commits (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`).
Do not auto-commit unless the user explicitly asks.
