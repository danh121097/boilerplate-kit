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
backend envelope `{ status, data, meta }` (`meta` is `OffsetMeta`); `get(id)` and
`update(id, payload)` resolve the unwrapped `User`. The users page reads `data.data`,
shows `users.empty` for an empty list and `users.error` (server message first) on
failure. `Api.paginate` / `Api.cursorPaginate` and the `OffsetMeta`, `CursorMeta`,
`PaginatedResponse`, `CursorResponse`, `PaginationParams`, `CursorParams` types live in
`services/core`, identical across the web templates.

- `.key` — string key used for cache lookup and invalidation.
- `.queryKey(params?)` — builds the full query key array.
- `defineMutation({ invalidates: ["users.list"] })` — auto-invalidates on success.

## Socket.IO

`hooks/useSocketIO.ts` owns the connection for the mounting component:

- The handshake payload is `{ token: "Bearer <access token>", role, sig?, ctime? }`;
  `sig`/`ctime` come from `HMACSignatureGenerator.signRequest`, the same signer as the
  HTTP requests (present only when `VITE_HMAC_SECRET` is set).
- A failed handshake schedules one trailing reconnect after `RECONNECT_THROTTLE_MS`
  (2 s); failures inside the window are dropped. The timer is cleared on unmount.
- `useSocketEvent(event, cb)` reads the socket from the store through a selector, so it
  rebinds when the socket changes.
