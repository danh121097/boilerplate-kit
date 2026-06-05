# Conventions

Cross-cutting patterns used everywhere in `src/`. For full naming/lint rules see
[code-standards.md](../code-standards.md).

## Barrel `index.ts` Pattern

Each folder re-exports its public surface from an `index.ts` so callers import
the folder, not deep file paths. Examples:

- `src/services/index.ts` → `./auth`, `./core`, `./init-services`, `./users`
- `src/services/core/index.ts` → every core module
- `src/enums/index.ts` → `./socket-events`, `./storage-keys`
- `src/utils/index.ts` → `./cn`, `./date-format`

```ts
import { Api, ApiInterceptors } from "@/services/core";
import { STORAGE_KEYS } from "@/enums";
```

## `@/` Alias

`@/` maps to `src/` (defined in both `vite.config.ts` and `tsconfig.json`
`paths`). Always import via `@/...` — never long relative chains like
`../../services/core`.

## File Size Guidance

Aim for ≤ ~200 LOC per file; split early into focused modules/components. The
core service layer follows this — e.g. refresh logic is split across
`refresh-token-manager.ts`, `auth-refresh-client.ts`, and `interceptors.ts`
rather than one large file.

## Enums Registry (`src/enums/`)

Constant maps with `as const` plus a derived union type, referenced instead of
string literals so names stay consistent across the codebase.

- `socket-events.ts` — `SOCKET_EVENT` (e.g. `AUTHENTICATED`, `UNAUTHORIZED`,
  `CONNECT_ERROR`) + `SOCKET_UNAUTHORIZED_MESSAGE` + `SocketEvent` type.
- `storage-keys.ts` — `STORAGE_KEYS` (`AUTH_TOKEN`, `LANGUAGE`, `THEME`) prefixed
  by `VITE_APP_NAME`, so one rename ripples cleanly:

```ts
const APP_PREFIX = import.meta.env.VITE_APP_NAME || "PRISM_APP";
export const STORAGE_KEYS = {
  AUTH_TOKEN: `${APP_PREFIX}_AUTH_TOKEN`,
  // ...
} as const;
```

## Utils (`src/utils/`)

Small, pure helpers, auto-imported (via `vite.config.ts` `dirs`):

- `cn(...inputs)` — `clsx` + `tailwind-merge` class combiner for components.
- `formatDate(date, pattern)` / `fromNow(date)` — dayjs wrappers (the
  `relativeTime` plugin is extended once at module load).

## Component Auto-Registration

Only `src/components/ui/` is auto-registered (`unplugin-vue-components` `dirs` in
`vite.config.ts`). Feature components elsewhere stay explicit imports so the
global registry doesn't grow unbounded. Stores are also explicit imports.

## Related Documentation

- [Directory Structure](./directory-structure.md)
- [Services & Stores](./services-and-stores.md)
- [code-standards.md](../code-standards.md) — enforced rules
