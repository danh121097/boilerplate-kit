# Project Overview — PDR

## Vision

A production-ready React Native mobile starter (Expo managed, dev build) that teams can
scaffold once and extend. Ships with a full axios service layer (JWT bearer +
refresh-token rotation over encrypted MMKV storage + HMAC-signed requests), Expo Router
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
| Storage | react-native-mmkv (AES-256 encrypted; key in expo-secure-store → Keychain/Keystore) | 4.x |
| Tests | jest-expo + `@testing-library/react-native` | — |
| Package manager | pnpm | 9+ |
| Language | TypeScript | 5.8 strict (Expo-pinned) |

## Scripts

```bash
pnpm dev          # expo start (Metro dev server for the dev client)
pnpm ios          # expo run:ios (build + run the dev client)
pnpm android      # expo run:android
pnpm typecheck    # tsc --noEmit
pnpm test         # jest-expo
pnpm lint         # eslint + prettier --check (read-only)
pnpm lint:fix     # eslint --fix + prettier --write
pnpm format       # prettier --write
```

## Constraints

- No `any` without explicit justification comment.
- `strict`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` and `verbatimModuleSyntax` in tsconfig.
- Storage is one AES-256 encrypted MMKV instance whose key is held in the Keychain/Keystore. MMKV is
  synchronous; the token helpers stay **async** (stable contract) and must be awaited.
- Dev build only: `react-native-mmkv` v4 is a native (Nitro) module, so Expo Go cannot run the app.
- HMAC secret is required by the bundled backends and must equal the backend `HMAC_SECRET`
  (empty means every request gets a 401; a dev build warns once). It ships in the bundle,
  so it is public — an anti-abuse layer, not a security boundary.
- `EXPO_PUBLIC_*` environment variables are inlined at build time — no secrets.
- Hard logout: a refused refresh, or a 401 or 404 on the session query (`AuthModel.revokeSession()`), ends the session as expired (`onSessionEnded`); `watchSessionEnd` resets auth state; the `(app)` gate redirects to `/login?redirect=…` (no `window.location`).
- File size target ≤ 200 LOC per file; split early.
