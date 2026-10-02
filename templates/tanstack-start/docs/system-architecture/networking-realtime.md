# Networking

## Request flow

```
Route component
  → useUsersListQuery()          defineQuery hook
  → UsersModel.list()            Model method
  → Api.paginate<User>()         axios instance ({ data, meta } envelope)
  → request interceptor          HMAC headers (auth cookies auto-sent)
  → HTTP
  → response interceptor         envelope unwrap / 401 refresh
  → resolved data
```

## Api class

`src/services/core/api.ts` — multi-service axios wrapper.

- `Api.setBaseURL(url, service)` — register a backend.
- `Api.registerInterceptors(interceptors)` — install once at startup.
- Each `Api` instance lazily applies interceptors on first request.
- Per-instance `service` tag propagates through `config.serviceType` so the
  response interceptor knows which refresh endpoint to call.

## TanStack React Query integration

`defineQuery` / `defineMutation` in `src/services/core/tanstack.ts` wrap
`useQuery` / `useMutation` with a stable key + fetcher pattern:

```ts
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () => withSessionRefresh(() => getUsersServerFn()),
});
```

- `.key` — string key used for cache lookup and invalidation.
- `.queryKey(params?)` — builds the full query key array.
- `.queryOptions(params?)` — full `queryOptions` (key, fetcher, `staleTime`, `select`, …) for loaders.
  The fetcher receives `(params, { signal })`; pass `signal` to the request to cancel it.
- `prefetchQueries(def, [def, params])` — loader helper, never throws; `ensureQueries(...)` — same
  but rejects on failure, for routes that cannot render without the data.
- `defineMutation({ invalidates: ["users.list", ["users.detail", id]] })` — auto-invalidates on
  success; a string is a key prefix, an array targets one exact key.
- Hook overrides (`onMutate/onSuccess/onError/onSettled`) run after, and never replace, the
  callbacks in the definition's `options`. `.mutationOptions()` exposes the options for tests.
- `defineMutation({ optimistic: { queryKey, update } })` — opt-in optimistic cache edit, rolled back
  on error; invalidation moves to settle and waits for sibling mutations on the same keys. Helpers
  live in `tanstack-optimistic.ts`; mutations in `tanstack-mutation.ts`.

## Socket.IO

`useSocketIO` (`src/hooks/useSocketIO.ts`) signs the handshake with the core
`HMACSignatureGenerator.signRequest` (`GET /socket`), the same signer the axios
interceptor uses, so there is one HMAC implementation. `socket.io-client` is
imported lazily inside an effect, which keeps it out of the SSR bundle. The
client connects to the bare backend origin (`getApiOrigin()`).

### Handshake auth

`auth` is a callback, so every connect and reconnect attempt signs a fresh
`ctime` and `sig` (a stale `ctime` would fall outside the backend's window). The
payload is only `{ sig, ctime }`: no `role`, and no `token`, because in cookie
mode the httpOnly `accessToken` cookie travels with the handshake
(`withCredentials: true`). With an empty `VITE_HMAC_SECRET` the payload is `{}`.
The server events used are `authenticated`, `connect_error` and `disconnect`
(`SOCKET_EVENT`); the old `unauthorized` and `notification` events no longer exist.

### Connection state

`authenticated` in the socket store becomes `true` only when the server emits
`SOCKET_EVENT.AUTHENTICATED`. It becomes `false` on `connect_error`, on the
built-in `disconnect` event and when the socket is destroyed. `connectSocket()`
never sets it.

### Reconnect policy

The server rejects a bad handshake (missing, expired or revoked token, bad HMAC)
with a `connect_error` message `Unauthorized!`.

- If `socket.active` is `true`, socket.io is already reconnecting (network error,
  server down) and nothing extra is scheduled.
- If `socket.active` is `false` and the message is `Unauthorized!`, the access
  cookie is probably expired: the hook calls `refreshSession()` once, then
  `connect()` on the same socket with a freshly signed handshake. A refused
  refresh (or a session already ended) disconnects and stops; a transient refresh
  failure falls back to the backoff below.
- A rejection whose `error.data.errorType` is `HMAC_ERROR` (`HMAC_ERROR_TYPE`: clock skew
  or a wrong secret; token rejections carry no `data`) never refreshes and does not use
  the refresh budget: it goes straight to the backoff below with a freshly signed handshake.
- At most `MAX_REFRESH_ATTEMPTS = 3` refreshes run per outage (the counter resets
  when `authenticated` arrives). After that, and for any other rejection, one
  manual retry is scheduled (errors while it is pending do not reschedule) after
  `Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)` with
  `RECONNECT_BASE_MS = 2000` and `RECONNECT_MAX_MS = 30_000`, so 2 s, 4 s, 8 s,
  16 s, 30 s, 30 s, and so on. Each retry signs a fresh `sig` and `ctime`.
- A `disconnect` with reason `io server disconnect` (the server closed the socket, e.g. a graceful restart; socket.io does not reconnect on its own) schedules the same retry.
- `attempt` resets to 0 when `authenticated` arrives.
- Unmounting (or `destroySocket`) clears a pending retry and cancels an in-flight
  refresh, and nothing connects afterwards.
- Residual: once the refresh budget is spent, an idle socket keeps retrying with
  backoff but is rejected until an HTTP call refreshes the access token.

### Lifecycle and header status

The socket is open only while signed in. `SocketStatus`
(`src/components/socket-status.tsx`) calls `useSocketIO()` and is rendered in the
root layout header next to the Logout control only when `isAuthenticated`; signing
out unmounts it, which destroys the socket. It shows a dot (`bg-emerald-500` when
authenticated, `bg-muted-foreground` otherwise) with visually hidden text, in a
`role="status"` wrapper with a `title`. Texts come from `socket.connected` and
`socket.reconnecting`.

`useSocketEvent` reads the socket from the store through a selector, so listeners
rebind when the socket changes.
