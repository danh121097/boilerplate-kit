# Conventions

## File Naming

- **TypeScript/TSX**: kebab-case (`hmac-signature.ts`, `query-keys.ts`, `counter.ts`)
- **Hooks**: camelCase matching function name (`useSocketIO.ts`)
- **Components**: PascalCase only in JSX imports; files are kebab-case when possible
- **App Router pages**: `page.tsx` inside named segment folders
- **Server helpers**: kebab-case in `src/server/` (`server-api.ts`, `session.ts`)

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
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null; // server: no document
  // ...
}
```

**Note:** Auth tokens are httpOnly cookies (inaccessible to JavaScript on any platform).
Browser guards only apply to the language cookie, the session hint and cross-tab sync.

## Commit Style

Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
No AI references in commit messages.

## File Size

Target ≤ 200 LOC per file. Split at logical boundaries (domain, concern, layer).
