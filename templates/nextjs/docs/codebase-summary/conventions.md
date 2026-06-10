# Conventions

## File Naming

- **TypeScript/TSX**: kebab-case (`hmac-signature.ts`, `query-keys.ts`, `counter.ts`)
- **Hooks**: camelCase matching function name (`useAppVersion.ts`, `useAuth.ts`)
- **Components**: PascalCase only in JSX imports; files are kebab-case when possible
- **App Router pages**: `page.tsx` inside named segment folders
- **Server helpers**: kebab-case in `src/server/` (`server-api.ts`, `get-me.ts`)

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

Guard browser APIs that may be called from server contexts:

```ts
function reloadPage(): void {
  if (typeof window !== "undefined") window.location.reload();
}

export function initI18n(): void {
  // Safe to call from RSC + client; returns env default when window is undefined
  const lang = typeof window !== "undefined" ? getSavedLanguage() : DEFAULT_LANG;
  i18n.changeLanguage(lang);
}
```

**Note:** Auth tokens are httpOnly cookies (inaccessible to JavaScript on any platform).
Storage guards only apply to i18n locale persistence and client-side reload logic.

## Commit Style

Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
No AI references in commit messages.

## File Size

Target ≤ 200 LOC per file. Split at logical boundaries (domain, concern, layer).
