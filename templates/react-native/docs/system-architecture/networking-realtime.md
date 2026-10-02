# Networking

## Request flow

```
Route component
  → useUsersListQuery()          defineQuery hook
  → UsersModel.list()            Model method
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

- `.key` — string key used for cache lookup and invalidation.
- `.queryKey(params?)` — builds the full query key array.
- `.queryOptions(params?)` — full `queryOptions` (key, fetcher, `staleTime`, `select`, …) for
  `ensureQueryData`. The fetcher receives `(params, { signal })`; pass `signal` to the
  request to cancel it.
- `defineMutation({ invalidates: ["users.list", ["users.detail", id]] })` — auto-invalidates on
  success; a string is a key prefix, an array targets one exact key.
- Hook overrides (`onMutate/onSuccess/onError/onSettled`) run after, and never replace, the
  callbacks in the definition's `options`. `.mutationOptions()` exposes the options for tests.
- `defineMutation({ optimistic: { queryKey, update } })` — opt-in optimistic cache edit, rolled back
  on error; invalidation moves to settle and waits for sibling mutations on the same keys. Helpers
  live in `tanstack-optimistic.ts`; mutations in `tanstack-mutation.ts`.

## Users contract and pagination

`services/core/types.ts` defines `OffsetMeta`, `CursorMeta`, `PaginatedResponse<T>`,
`CursorResponse<T>`, `PaginationParams` and `CursorParams`; `Api.paginate<T>()` /
`Api.cursorPaginate<T>()` return the backend list envelope (`{ success, data, meta }`)
as is. `UsersModel.list(params?)` returns `PaginatedResponse<User>`; `get(id)` returns
the unwrapped `User`. Screens read `data.data`, show
`users.error` on failure and `users.empty` for an empty list. The query key
(`users.list`) is unchanged.

## Socket.IO

- The handshake `auth` is a callback, so every connect and reconnect builds a fresh
  payload: `{ token: "Bearer <access>", sig, ctime }` with a new `ctime` and
  signature each time (`HMACSignatureGenerator.signRequest`, `GET /socket`, the same
  signer as HTTP). The access token is read asynchronously from SecureStore.
  `token` is omitted when signed out (never an empty `Bearer`), `sig`/`ctime` when no
  secret is set, and the payload carries no `role`: the backend reads only `sig`,
  `ctime` and `token`, and takes the role from the JWT.
- If the SecureStore read fails, the handshake goes out empty and unsigned; the
  backend rejects it with `connect_error "Unauthorized!"`, so the failure is visible
  (the status dot goes grey) instead of the handshake hanging.
- The socket events are `authenticated`, `ping`, `disconnect` and `connect_error`
  (`SOCKET_EVENT`); there are no `unauthorized` or `notification` events.
- `authenticated` in the socket store becomes true only when the server emits
  `authenticated`. It is false after `connect_error`, `disconnect` and destroy;
  `connectSocket()` never sets it to true.
- A `connect_error` while `socket.active` is true means socket.io is already
  auto-reconnecting (network error, server down): nothing extra is scheduled. When
  `socket.active` is false the server rejected the handshake:
  - An HMAC rejection (`error.data.errorType === "HMAC_ERROR"`, detected with
    `isHmacError`; the backends send it only for signature / clock failures, token
    rejections have no `data`) never refreshes and spends none of the budget: it logs
    the dev-only signature warning (`warnHmacRejected`) and takes the retry timer
    below, where the reconnect signs with a fresh `ctime`.
  - `Unauthorized!` without that `data`, with refresh budget left: the session is refreshed once
    (`refreshSession`, the same single-flight as HTTP) and the socket reconnects
    once with the new token and a new `ctime`. A refused refresh (401/403) ends the
    session and stops; a transient refresh failure falls back to the retry timer.
  - The budget is `MAX_REFRESH_ATTEMPTS` (3) refreshes per outage, reset when
    `authenticated` arrives. Any other rejection, or an exhausted budget, schedules
    one retry timer that reconnects without refreshing, after
    `Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)` (`RECONNECT_BASE_MS`
    2000, `RECONNECT_MAX_MS` 30 000, so 2 s, 4 s, 8 s, 16 s, 30 s, 30 s, ...). Errors
    while a retry is pending do not reschedule.
  - A `disconnect` with reason `io server disconnect` (the server closed the socket,
    e.g. a graceful restart; socket.io does not reconnect on its own) joins the same
    retry timer.
- Accepted residual: once repeated handshake rejections have used the refresh budget,
  an idle socket keeps retrying with the stale token and stays down until an HTTP call
  refreshes the token. There is deliberately no timer-based refresh: it would burn the
  backend's shared auth rate-limit bucket.
- Unmount or destroy clears a pending retry or in-flight recovery and nothing
  connects afterwards.
- The `(app)` layout calls `useSocketIO()` only while signed in, so signing out
  closes the socket. `SocketStatus` (`src/components/socket-status.tsx`) reads
  `authenticated` from the store and is rendered as every screen's native
  `headerRight` (below the status bar). It shows a `size-2 rounded-full` dot (`bg-emerald-500` when
  authenticated, `bg-muted-foreground` otherwise) with an `accessibilityLabel` from
  `socket.connected` / `socket.reconnecting` and a polite live region.
- `useSocketEvent` reads the socket from the store with a selector, so it rebinds when
  the socket changes.
