# Networking

## Service Layer (Client-Side Only)

The axios service layer runs exclusively in the browser. Never call service
methods from React Server Components or server actions. For SSR data fetching,
use the server helpers in `src/server/` instead.

```
"use client" component / useEffect
  └── UsersModel.list()          ← service call
        └── Api instance (axios, withCredentials: true)
              ├── request interceptor: attach HMAC headers
              ├── GET/POST to baseURL/path (httpOnly cookies auto-sent)
              └── response interceptor: unwrap envelope / handle 401 → refresh
```

## Api Class

`Api` (src/services/core/api.ts) wraps axios with:

- Multi-service baseURL registry (`Api.setBaseURL`)
- `withCredentials: true` — httpOnly cookies auto-included
- Lazy interceptor attachment (applied on first request)
- Convenience methods: `get`, `post`, `put`, `patch`, `delete`, `paginate`, `cursorPaginate`

## Interceptors

`ApiInterceptors` (src/services/core/interceptors.ts):

**Request:** attach `serviceType` and HMAC headers (no Bearer — cookies are auto-sent).

**Response:**

- Blob passthrough (for file downloads)
- Envelope unwrap: a boolean `success` — `{ success: true, ... }` resolves, `{ success: false, ... }` rejects
- 401 handling: refresh + replay if eligible; otherwise reject with `error_code: 401`.
  Never reloads. Not eligible: the refresh/credential endpoints (`skipPaths` —
  login/register/logout), an already-replayed request, or no session hint
  (anonymous). A refused refresh (401/403) calls `endSession("expired")` and
  rejects with the original 401 (providers route to `/login`); a transient one
  (network, 15 s timeout, 429, 5xx) keeps the session and rejects with a
  `retryable: true` non-401 error. A 401 with `errorType: "HMAC_ERROR"` (secret
  mismatch, clock skew) never refreshes and keeps the session; it rejects with the
  backend error marked `retryable: true`. During a logout, a 401 rejects with
  `{ error_code: 401, message: "session_ended" }` without calling
  `/auth/refresh`.

## Single-Flight + Cross-Tab Refresh

`RefreshTokenManager` ensures concurrent 401s trigger exactly one refresh
network call. All parallel requests await the same in-flight promise. Across
tabs a Web Lock (`navigator.locks`, `${APP_PREFIX}:auth-refresh:<service>`) lets one tab
refresh at a time; a tab that waited skips its own refresh when the shared
`${APP_PREFIX}:auth-refresh:<service>:at` stamp shows another tab already rotated the
cookies. See [security-auth.md](./security-auth.md).

## Envelope Convention

The interceptor recognizes the backend envelope by its boolean `success`:

```json
{ "success": true, "data": {...} }
```

Non-envelope responses (e.g. jsonplaceholder plain arrays) pass through as-is.

## Pagination

`Api.paginate<T>({ params })` (offset: `?page&limit`) and `Api.cursorPaginate<T>`
(`?cursor&limit`) return the backend's full envelope — `PaginatedResponse<T>`
(`{ data, meta }`) or `CursorResponse<T>` — instead of unwrapping `data`, so
pagination metadata reaches the caller. `UsersModel.list(params?)` is built on
`paginate`; the SSR counterpart is `serverApiPaginate` in `src/server/server-api.ts`.

## Socket.IO

`useSocketIO()` (`src/hooks/useSocketIO.ts`, client only) creates the socket from
`NEXT_PUBLIC_APP_ENDPOINT` (bare origin, no API prefix) with `transports:
["websocket"]`, `withCredentials: true` (the httpOnly access cookie authenticates
the handshake — no Bearer), `autoConnect: false` and `forceBase64: true`. The
`socket.io-client` module is imported lazily inside an effect, so it stays out of
the SSR bundle.

- **Handshake auth** is a callback (`auth: (cb) => cb({ sig, ctime })`), so every
  (re)connect is signed anew with a fresh `ctime`. `sig`/`ctime` come from the
  same `HMACSignatureGenerator.signRequest` the HTTP interceptor uses (method
  `GET`, path `/socket`); without `NEXT_PUBLIC_HMAC_SECRET` they are omitted. No
  `role` or token is sent.
- **Lifecycle** — the socket is opened only while signed in. `SocketStatus`
  (`src/components/socket-status.tsx`) calls `useSocketIO()` and is rendered in the
  header next to Logout only when `isAuthenticated`; signing out unmounts it, which
  destroys the socket.
- **`authenticated`** becomes `true` only on the server's `authenticated` event, and
  `false` on `connect_error`, on the built-in `disconnect` event and on destroy.
  `connectSocket()` never sets it.
- **Reconnect** — on `connect_error`, if `socket.active` is true socket.io is already
  auto-reconnecting (network error, server down) and nothing extra is scheduled.
  If it is false the server rejected the handshake (`Unauthorized!`): the hook
  refreshes the session once (`refreshSession`, the same single-flight refresh as
  HTTP) and calls `connect()` again with the rotated cookie. A rejection whose
  `error.data.errorType` is `HMAC_ERROR` (`HMAC_ERROR_TYPE`: clock skew or a wrong
  secret; token rejections carry no `data`) never refreshes and spends none of the
  budget: it goes straight to the backoff. Budget:
  `MAX_REFRESH_ATTEMPTS = 3` refreshes per outage; after that, or for any other
  rejection, one manual retry is scheduled (errors while one is pending do not
  reschedule) after `min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)` (2 s,
  4 s, 8 s, 16 s, 30 s, 30 s, ...; `RECONNECT_BASE_MS = 2000`,
  `RECONNECT_MAX_MS = 30_000`). A refresh refused by the server (session over)
  stops recovery and disconnects; a transient failure, including an
  `HMAC_ERROR`, falls back to the backoff. A `disconnect` with reason
  `io server disconnect` (the server closed the socket, e.g. a graceful restart;
  socket.io does not reconnect on its own) schedules the same retry. Both
  counters reset on `authenticated`. Destroying the socket or unmounting clears a
  pending retry and invalidates an in-flight refresh, so nothing connects
  afterwards. Residual: once the refresh budget is spent, an idle socket keeps
  failing with a stale cookie until an HTTP call refreshes the token. The
  backend emits only `authenticated` and `ping`; there is no `unauthorized` or
  `notification` event.
- **Header status** — `SocketStatus` renders a `role="status"` wrapper with a
  `size-2 rounded-full` dot (`bg-emerald-500` when authenticated, otherwise
  `bg-muted-foreground`), a `title`, and visually hidden text from the
  `socket.connected` / `socket.reconnecting` keys (en / ja).
- **State** lives in `stores/socket-io.ts` (`socket`, `authenticated`).
  `useSocketEvent(event, cb)` reads the socket through a selector
  (`useSocketIOStore((s) => s.socket)`), so it rebinds when the socket changes.

Event names are in `src/enums/socket-events.ts`.
