# SSR and Runtime Config

## The SSR Boundary Problem

Next.js App Router renders server components on the server where `window`,
`localStorage`, and `document` do not exist. The axios service layer uses
`localStorage` for token storage and `window.location` for page reloads.

## Guards Applied

Every storage operation in `auth-token-storage.ts` checks `isClient()`:

```ts
function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getAuthToken(service: string = "MAIN"): string | null {
  if (!isClient()) return null;          // ← SSR returns null, never throws
  return localStorage.getItem(resolveTokenKey(service));
}
```

The `reloadPage()` helper in `interceptors.ts` is also guarded:

```ts
function reloadPage(): void {
  if (typeof window !== "undefined") window.location.reload();
}
```

## Environment Variables

All client-visible configuration uses `NEXT_PUBLIC_*` prefix so Next.js inlines
the values at build time:

| Variable | Used in |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | `init-services.ts` — sets the MAIN service base URL |
| `NEXT_PUBLIC_APP_NAME` | `enums/storage-keys.ts` — localStorage key prefix |
| `NEXT_PUBLIC_HMAC_SECRET` | `hmac-signature.ts` — HMAC signing |
| `NEXT_PUBLIC_BUILD_VERSION` | `hmac-signature.ts` — `x-version` header |
| `NEXT_PUBLIC_LANGUAGE_CODE` | `i18n/i18n.ts` — default locale fallback |

**Note:** `NEXT_PUBLIC_HMAC_SECRET` is client-readable. For a stronger guarantee,
move signing into a Next.js Route Handler and keep the secret server-only
(no `NEXT_PUBLIC_` prefix). The starter uses the simpler approach for parity
with the reactjs/vuejs templates.

## Service Initialization Timing

`initServices()` is called inside `useEffect` in `app/providers.tsx`. This
guarantees it only runs after hydration in the browser — never during SSR:

```ts
useEffect(() => {
  if (!initialized.current) {
    initServices();
    initialized.current = true;
  }
}, []);
```
