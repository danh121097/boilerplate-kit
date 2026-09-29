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
- `defineMutation({ invalidates: ["users.list"] })` — auto-invalidates on success.

## Users contract and pagination

`services/core/types.ts` defines `OffsetMeta`, `CursorMeta`, `PaginatedResponse<T>`,
`CursorResponse<T>`, `PaginationParams` and `CursorParams`; `Api.paginate<T>()` /
`Api.cursorPaginate<T>()` return the backend list envelope (`{ status, data, meta }`)
as is. `UsersModel.list(params?)` returns `PaginatedResponse<User>`; `get(id)` and
`update(id, payload)` return the unwrapped `User`. Screens read `data.data`, show
`users.error` on failure and `users.empty` for an empty list. The query key
(`users.list`) is unchanged.

## Socket.IO

- The handshake `{ sig, ctime }` is signed with `HMACSignatureGenerator.signRequest`
  (the same signer as HTTP requests), `GET /socket`; the Bearer token is read
  asynchronously from SecureStore before connecting.
- `authenticated` in the socket store becomes true only when the server emits
  `authenticated`. It is false after `connect_error`, `disconnect` and destroy;
  `connectSocket()` never sets it to true.
- A `connect_error` while `socket.active` is true means socket.io is already
  auto-reconnecting (network error, server down): nothing extra is scheduled. When
  `socket.active` is false the server rejected the handshake (`Unauthorized!`): one
  manual retry is scheduled after `Math.min(RECONNECT_BASE_MS * 2 ** attempt,
  RECONNECT_MAX_MS)` (`RECONNECT_BASE_MS` 2000, `RECONNECT_MAX_MS` 30 000, so 2 s, 4 s,
  8 s, 16 s, 30 s, 30 s, ...). Errors while a retry is pending do not reschedule. The
  retry rebuilds `socket.auth` (fresh token, `sig`, `ctime`) and calls `connect()` on
  the same socket. A `disconnect` with reason `io server disconnect` (the server closed the socket, e.g. a graceful restart; socket.io does not reconnect on its own) schedules the same retry. The attempt counter resets when `authenticated` arrives.
- The server `unauthorized` event destroys the socket. Unmount or destroy clears a
  pending retry and nothing connects afterwards.
- The `(app)` layout calls `useSocketIO()` only while signed in, so signing out
  closes the socket. `SocketStatus` (`src/components/socket-status.tsx`) reads
  `authenticated` from the store and is rendered as every screen's native
  `headerRight` (below the status bar). It shows a `size-2 rounded-full` dot (`bg-emerald-500` when
  authenticated, `bg-muted-foreground` otherwise) with an `accessibilityLabel` from
  `socket.connected` / `socket.reconnecting` and a polite live region.
- `useSocketEvent` reads the socket from the store with a selector, so it rebinds when
  the socket changes.
