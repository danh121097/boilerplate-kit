# Project Overview — PDR

## Vision

A production-ready React Native mobile starter (Expo managed) that teams can
scaffold once and extend. Ships with a full axios service layer (JWT bearer +
`expo-secure-store` refresh-token rotation + HMAC-signed requests), Expo Router
(file-based typed routes), TanStack React Query, Zustand, NativeWind v4,
react-i18next (`expo-localization` detection), and a complete jest-expo suite.

## Stack

| Concern | Choice | Version |
|---------|--------|---------|
| Runtime | Expo (managed) · React Native | 0.79 |
| UI framework | React | 19 |
| Navigation | Expo Router (file-based, typed routes) | latest |
| Data fetching | TanStack React Query | 5.x |
| State | Zustand | 5 |
| Forms | react-hook-form + zod | 7.x / 4.x |
| UI primitives | hand-written NativeWind components | — |
| Styling | NativeWind v4 (Tailwind for RN) | v4 |
| HTTP | axios | 1.x |
| i18n | react-i18next + i18next | 15.x / 24.x |
| Token storage | expo-secure-store (async, Keychain/Keystore) | — |
| Tests | jest-expo + `@testing-library/react-native` | — |
| Package manager | pnpm | 9+ |
| Language | TypeScript | 5.8 strict (Expo-pinned) |

## Scripts

```bash
pnpm dev          # expo start (Metro dev server)
pnpm ios          # open iOS simulator
pnpm android      # open Android emulator
pnpm typecheck    # tsc --noEmit
pnpm test         # jest-expo
pnpm lint         # eslint + prettier --check (read-only)
pnpm lint:fix     # eslint --fix + prettier --write
pnpm format       # prettier --write
```

## Constraints

- No `any` without explicit justification comment.
- `strict`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` and `verbatimModuleSyntax` in tsconfig.
- Token storage is **async**—all SecureStore reads/writes return promises.
- HMAC secret is required by the bundled backends and must equal the backend `HMAC_SECRET`
  (empty means every request gets a 401; a dev build warns once). It ships in the bundle,
  so it is public — an anti-abuse layer, not a security boundary.
- `EXPO_PUBLIC_*` environment variables are inlined at build time — no secrets.
- Hard logout: a refused refresh, or a 401 or 404 on the session query (`AuthModel.revokeSession()`), ends the session as expired (`onSessionEnded`); `watchSessionEnd` resets auth state; the `(app)` gate redirects to `/login?redirect=…` (no `window.location`).
- File size target ≤ 200 LOC per file; split early.
