# Conventions

## File Naming

- **TypeScript/TSX**: kebab-case (`auth-token-storage.ts`, `counter.ts`)
- **Hooks**: camelCase matching function name (`useAppVersion.ts`)
- **Components**: PascalCase only in JSX imports; files are kebab-case when possible
- **App Router pages**: `page.tsx` inside named segment folders

## Import Alias

All src imports use `@/`:
```ts
import { STORAGE_KEYS } from "@/enums";
import { UsersModel } from "@/services/users";
```

## "use client" Directive

Add `"use client"` at the top of any file that uses:
- React hooks (`useState`, `useEffect`, `useRef`, etc.)
- Browser APIs (`window`, `localStorage`, `document`)
- Event handlers that reference browser state
- Third-party libraries that require a browser context (react-i18next hooks, Zustand)

## SSR Guard Pattern

```ts
function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getAuthToken(): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}
```

## Commit Style

Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
No AI references in commit messages.

## File Size

Target ≤ 200 LOC per file. Split at logical boundaries (domain, concern, layer).
