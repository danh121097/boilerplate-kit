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
- `defineMutation({ invalidates: ["users.list"] })` — auto-invalidates on success.

## Socket.IO

`useSocketIO` (`src/hooks/useSocketIO.ts`) signs the handshake with the core
`HMACSignatureGenerator.signRequest` (`GET /socket`), the same signer the axios
interceptor uses, so there is one HMAC implementation. `socket.io-client` is
imported lazily inside an effect, which keeps it out of the SSR bundle.

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
- If `socket.active` is `false`, the handshake was rejected: one manual retry is
  scheduled (errors while it is pending do not reschedule) after
  `Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)` with
  `RECONNECT_BASE_MS = 2000` and `RECONNECT_MAX_MS = 30_000`, so 2 s, 4 s, 8 s,
  16 s, 30 s, 30 s, and so on. The retry rebuilds `socket.auth` (fresh HMAC `sig` and
  `ctime`) and calls `connect()` on the same socket.
- A `disconnect` with reason `io server disconnect` (the server closed the socket, e.g. a graceful restart; socket.io does not reconnect on its own) schedules the same retry.
- `attempt` resets to 0 when `authenticated` arrives.
- A server `unauthorized` event destroys the socket. Unmounting clears a pending
  retry, and nothing connects afterwards.

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
