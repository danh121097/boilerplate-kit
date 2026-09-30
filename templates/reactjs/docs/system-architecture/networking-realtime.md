# Networking

## Request flow

```
Route component
  → useUsersListQuery()          defineQuery hook
  → UsersModel.list(params?)     Model method
  → Api.paginate<User>()         axios instance
  → request interceptor          HMAC headers + Bearer token
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
  key: "users.list",
  fetcher: () => UsersModel.list(),
});
```

## Users list contract

`UsersModel.list(params?: PaginationParams): Promise<PaginatedResponse<User>>` returns the
backend envelope `{ success, data, meta }` (`meta` is `OffsetMeta`); `get(id)` and
`update(id, payload)` resolve the unwrapped `User`. The users page reads `data.data`,
shows `users.empty` for an empty list and `users.error` (server message first) on
failure. `Api.paginate` / `Api.cursorPaginate` and the `OffsetMeta`, `CursorMeta`,
`PaginatedResponse`, `CursorResponse`, `PaginationParams`, `CursorParams` types live in
`services/core`, identical across the web templates.

- `.key` — string key used for cache lookup and invalidation.
- `.queryKey(params?)` — builds the full query key array.
- `.queryOptions(params?)` — full `queryOptions` (key, fetcher, `staleTime`, `select`, …) for
  `ensureQueryData` / prefetch. The fetcher receives `(params, { signal })`; pass `signal` to the
  request to cancel it.
- `prefetchQueries(def, [def, params])` / `ensureQueries(...)` — route-loader helpers (prefetch
  never throws; ensure rejects on failure).
- `defineMutation({ invalidates: ["users.list", ["users.detail", id]] })` — auto-invalidates on
  success; a string is a key prefix, an array targets one exact key.
- Hook overrides (`onMutate/onSuccess/onError/onSettled`) run after, and never replace, the
  callbacks in the definition's `options`. `.mutationOptions()` exposes the options for tests.
- `defineMutation({ optimistic: { queryKey, update } })` — opt-in optimistic cache edit, rolled back
  on error; invalidation moves to settle and waits for sibling mutations on the same keys. Helpers
  live in `tanstack-optimistic.ts`; mutations in `tanstack-mutation.ts`.

## Socket.IO

`hooks/useSocketIO.ts` owns the connection for the mounting component.

- **Lifecycle.** The socket is opened only while signed in: `components/socket-status.tsx`
  calls `useSocketIO()` and the root layout renders it next to the Logout control only when
  `isAuthenticated`. Signing out unmounts it, which destroys the socket.
- **Handshake.** The payload is `{ token: "Bearer <access token>", role, sig?, ctime? }`;
  `sig`/`ctime` come from `HMACSignatureGenerator.signRequest`, the same signer as the
  HTTP requests (present only when `VITE_HMAC_SECRET` is set). The server rejects a bad
  handshake with `connect_error` "Unauthorized!" and emits `authenticated` on success.
- **Connection state.** `authenticated` in the socket store becomes `true` only when the
  server emits `authenticated`. It becomes `false` on `connect_error`, on `disconnect` and
  on destroy. `connectSocket()` never sets it.
- **Reconnect.** On `connect_error`, if `socket.active` is true socket.io is already
  auto-reconnecting (network error, server down) and nothing extra is scheduled. If it is
  false the server rejected the handshake: one manual retry is scheduled (errors while one
  is pending do not reschedule) after `min(RECONNECT_BASE_MS * 2 ** attempt,
  RECONNECT_MAX_MS)`, with `RECONNECT_BASE_MS = 2000` and `RECONNECT_MAX_MS = 30_000`
  (2s, 4s, 8s, 16s, 30s, 30s, ...). The retry re-signs `socket.auth` (fresh token and
  HMAC `sig`/`ctime`) and calls `connect()` on the same socket. A `disconnect` with reason `io server disconnect` (the server closed the socket, e.g. a graceful restart; socket.io does not reconnect on its own) schedules the same retry. `attempt` resets to 0 when
  `authenticated` arrives. A server `unauthorized` event destroys the socket. Unmount
  clears a pending retry.
- **Status indicator.** `SocketStatus` renders a `role="status"` wrapper with a small dot
  (`bg-emerald-500` when authenticated, `bg-muted-foreground` otherwise), a `title` and
  visually hidden text from `socket.connected` ("Realtime connected") or
  `socket.reconnecting` ("Realtime reconnecting").
- `useSocketEvent(event, cb)` reads the socket from the store through a selector, so it
  rebinds when the socket changes.
