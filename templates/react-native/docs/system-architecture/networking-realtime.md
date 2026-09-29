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
- Reconnects after a connect error are throttled with a trailing timer of
  `RECONNECT_THROTTLE_MS` (2000 ms): the first error schedules one reconnect, errors
  inside the window are dropped, and the timer is cleared on unmount.
- `useSocketEvent` reads the socket from the store with a selector, so it rebinds when
  the socket changes.
