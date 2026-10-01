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

## Quick start

```sh
cp .env.example .env          # then edit values
pnpm install
pnpm dev                      # expo start — press i / a for iOS / Android
```

Point `EXPO_PUBLIC_APP_ENDPOINT` at a running backend (the `express`, `fastify` or
`nestjs` template in this kit works out of the box). Every `EXPO_PUBLIC_*` var is
inlined into the JS bundle at build time — never put real secrets there.

Where the backend is reachable from depends on where the app runs:

- **iOS simulator**: `http://localhost:3000` works.
- **Android emulator**: `localhost` is the emulator itself; use `http://10.0.2.2:3000`
  for the host machine.
- **Physical device**: use the host's LAN IP (e.g. `http://192.168.1.20:3000`) on the
  same network, and make sure the host firewall allows the port.
- **Release builds**: plain-HTTP (cleartext) requests are blocked by the platforms, so
  a release build needs an `https://` endpoint.

The target is native only (iOS and Android); there is no web build.

Checklist for a real backend (instead of mock auth):

1. `EXPO_PUBLIC_AUTH_MOCK` set to `false` or removed: `.env.example` ships it as `true`, and
   only exactly `true` or `1` turns the mock on.
2. `EXPO_PUBLIC_APP_ENDPOINT` and `EXPO_PUBLIC_API_PREFIX` match the backend.
3. `EXPO_PUBLIC_HMAC_SECRET` equals the backend `HMAC_SECRET`.

## Scripts

Native only (iOS and Android): there is no web target.

| Script           | Does                                                     |
| ---------------- | -------------------------------------------------------- |
| `pnpm dev`       | `expo start` (Metro dev server)                          |
| `pnpm ios`       | open in the iOS simulator                                |
| `pnpm android`   | open in an Android emulator                              |
| `pnpm test`      | run the jest-expo suite                                  |
| `pnpm test:watch`| jest watch mode                                          |
| `pnpm typecheck` | `tsc --noEmit`                                           |
| `pnpm lint`      | ESLint + Prettier check (read-only)                      |
| `pnpm lint:fix`  | ESLint `--fix` + Prettier write                          |
| `pnpm format`    | Prettier write                                           |

## Environment variables

Copy `.env.example` → `.env` and fill in the values:

| Variable                          | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `EXPO_PUBLIC_APP_ENDPOINT`        | Backend base URL (a device needs a reachable host, not `localhost`)     |
| `EXPO_PUBLIC_API_PREFIX`          | API path prefix (e.g. `/api/v1`)                                        |
| `EXPO_PUBLIC_APP_NAME`            | Prefix for SecureStore keys (sanitized to `[A-Za-z0-9._-]`)             |
| `EXPO_PUBLIC_LANGUAGE_CODE`       | Fallback language (`en` / `ja`) when nothing is saved and the device locale is unsupported |
| `EXPO_PUBLIC_HMAC_SECRET`         | Required by the bundled backends; must equal the backend `HMAC_SECRET`  |
| `EXPO_PUBLIC_BUILD_VERSION`       | Sent as `x-version`; injected by CI                                     |
| `EXPO_PUBLIC_AUTH_MOCK`           | Dev only: `true` answers `/auth/*` and `/users` in the app              |
| `EXPO_PUBLIC_AUTH_MOCK_EMAIL`     | Dev only: demo login email (default `demo@example.com`)                 |
| `EXPO_PUBLIC_AUTH_MOCK_PASSWORD`  | Dev only: demo login password (default `password`)                      |

In dev, values in the `.env*` files override `EXPO_PUBLIC_*` variables exported in the shell.
Put personal overrides in `.env.development.local` (gitignored); it wins over `.env` without
editing it. Restart Metro after changing any env file (`npx expo start -c`).

## Structure

```
app/                     Expo Router file routes
  _layout.tsx            root providers + initServices()
  (auth)/                unauthenticated group (login)
  (app)/                 authenticated group (auth-gated: home, profile)
src/
  components/            session banner, mock-auth badge
  components/ui/         NativeWind primitives (Button, Input, Card, Text)
  enums/                 storage keys + socket event registry
  i18n/                  i18next setup + locales
  providers/             QueryClientProvider
  services/
    core/                axios client, interceptors, refresh, HMAC, token storage
    auth/                auth service (login / register / logout / me) + dev data/mock-auth*.ts
    users/               users service
    init-services.ts     wire base URLs + interceptors + refresh options
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
   rotates the stored refresh token. Only a 401/403 from the refresh endpoint, or a
   401/404 on the `/auth/me` read, ends the session (tokens cleared, queries reset to signed out, and the auth gate sends the
   user to `/login` with a `redirect` of the current screen, restored after
   sign-in); offline, timeout, 429 and 5xx keep the tokens and surface a
   retryable error.
5. Logout blocks new refreshes, waits for any in-flight one, sends the latest
   refresh token in the body so the backend revokes it, then clears the tokens and
   resets the queries to signed out even if the request fails.

HMAC signing is an anti-abuse, light-integrity layer, not a security boundary:
`EXPO_PUBLIC_HMAC_SECRET` ships inside the bundle, so it is public. See [security-auth](./docs/system-architecture/security-auth.md).

Unlike the web templates there is no `window.location.reload()` — hard logout is
a state reset through `watchSessionEnd` (an `onSessionEnded` listener), and the
`(app)` auth gate redirects.

## Behavior notes

- **Users contract**: `UsersModel.list(params?)` returns `PaginatedResponse<User>`
  (`{ data, meta }`, same as the backend); `get` returns the unwrapped
  `User`. The home screen reads `data.data` and shows `users.empty` for an empty list.
- **Session unavailable banner**: when restoring the session fails transiently
  (offline, timeout, 5xx) the user stays signed in and a bottom banner
  (`session.unavailable` + `session.retry`) re-runs the restore. A 401 shows no banner.
- **Language**: EN/JA toggle on the profile screen, saved under `STORAGE_KEYS.LANGUAGE`
  (SecureStore). Resolution order: saved > device > `EXPO_PUBLIC_LANGUAGE_CODE` > `en`.
- **Theme**: light only, same neutral palette tokens as the web templates; there is no
  dark mode or dark toggle.
- **Not found**: `app/+not-found.tsx` uses the shared `not_found.*` keys.

## Out of scope

EAS Build / OTA updates / push notifications are intentionally not wired (no
`eas.json`). Add them per the [Expo docs](https://docs.expo.dev) when you need them.

## Mock auth (before backend integration)

Set `EXPO_PUBLIC_AUTH_MOCK=true` (with optional `EXPO_PUBLIC_AUTH_MOCK_EMAIL` /
`EXPO_PUBLIC_AUTH_MOCK_PASSWORD`) to answer `/auth/*` and `/users` inside the app
before the backend exists. See
[Mock auth](./docs/system-architecture/security-auth.md#mock-auth-before-backend-integration):
mock mode answers auth and users; the flag is ignored in production builds.

## Docs

See [`docs/README.md`](./docs/README.md) for the full documentation map.
