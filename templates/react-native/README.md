# React Native starter

Opinionated Expo (managed) mobile starter — the same services architecture as the
`reactjs` web template (RS256/refresh-rotation-aware HTTP client, HMAC-signed
requests, per-service token registry, auth + users services, Socket.IO), ported to
**Expo Router + NativeWind** with the web-only layers swapped for their mobile
equivalents. Kept lean enough to read in one sitting.

## Stack

| Concern         | Choice                                                              |
| --------------- | ------------------------------------------------------------------ |
| Runtime         | Expo (managed) · React Native 0.79 · React 19                      |
| Navigation      | Expo Router (file-based, typed routes, auth-gated route groups)    |
| Styling         | NativeWind v4 (Tailwind for RN) + hand-written `components/ui/`     |
| Data fetching   | TanStack Query                                                      |
| State           | Zustand (`auth`, `socket-io` stores)                               |
| HTTP            | axios client factory + injectable interceptors                     |
| Token storage   | `expo-secure-store` (async, Keychain/Keystore-backed)              |
| Auth            | JWT access token (Bearer) + refresh-token rotation (single-flight) |
| Request signing | HMAC request signing (crypto-js) on every request                  |
| Realtime        | Socket.IO (`socket.io-client`)                                     |
| Forms           | react-hook-form + Zod                                              |
| i18n            | i18next + react-i18next (`expo-localization` detection)            |
| Testing         | jest-expo + `@testing-library/react-native`                        |
| Lint / format   | ESLint flat config + Prettier                                      |

## Setup

```sh
cp .env.example .env          # then edit values
pnpm install
pnpm dev                      # expo start — press i / a / w for iOS / Android / web
```

Point `EXPO_PUBLIC_APP_ENDPOINT` at a running backend (the `express` or `nestjs`
template in this kit works out of the box). Every `EXPO_PUBLIC_*` var is inlined
into the JS bundle at build time — never put real secrets there.

## Scripts

| Script           | Does                                            |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | `expo start` (Metro dev server)                 |
| `pnpm ios`       | open in the iOS simulator                       |
| `pnpm android`   | open in an Android emulator                     |
| `pnpm web`       | run in the browser (react-native-web)           |
| `pnpm test`      | run the jest-expo suite                         |
| `pnpm typecheck` | `tsc --noEmit`                                  |
| `pnpm lint`      | ESLint                                          |
| `pnpm format`    | Prettier write                                  |

## Structure

```
app/                     Expo Router file routes
  _layout.tsx            root providers + initServices()
  (auth)/                unauthenticated group (login)
  (app)/                 authenticated group (auth-gated: home, profile)
src/
  components/ui/         NativeWind primitives (Button, Input, Card, Text)
  enums/                 storage keys + socket event registry
  i18n/                  i18next setup + locales
  providers/             QueryClientProvider
  services/
    core/                axios client, interceptors, refresh, HMAC, token storage
    auth/                auth service (login / register / logout / me)
    users/               users service
    init-services.ts     wire base URLs + interceptors + session-expired callback
  stores/                Zustand stores (auth, socket-io)
  styles/global.css      Tailwind entry (consumed by NativeWind/Metro)
```

## How auth works

1. `initServices()` (called once in the root layout) registers the MAIN backend's
   base URL, its SecureStore token slots, and its refresh endpoint, then installs
   the axios interceptors.
2. Login persists the access + refresh tokens to `expo-secure-store` (async).
3. Every request attaches `Bearer <access>` (read async from SecureStore) plus the
   HMAC signature headers.
4. On a 401 the response interceptor refreshes once (single-flight — concurrent
   401s share one network refresh), replays the request with the new token, and
   rotates the stored refresh token. If the refresh itself fails, that service's
   tokens are cleared and the injected `onSessionExpired` callback navigates back
   to `/login`.

Unlike the web templates there is no `window.location.reload()` — hard logout is a
router redirect wired through `onSessionExpired`.

## Out of scope

EAS Build / OTA updates / push notifications are intentionally not wired (no
`eas.json`). Add them per the [Expo docs](https://docs.expo.dev) when you need them.
