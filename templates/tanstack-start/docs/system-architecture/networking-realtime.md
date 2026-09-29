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
`HMACSignatureGenerator.signRequest` (`GET /socket`) — the same signer the axios
interceptor uses, so there is one HMAC implementation. A failed connection is
retried once per `RECONNECT_THROTTLE_MS` (2 s, trailing timer): further errors
inside the window share the pending retry. `useSocketEvent` reads the socket from
the store through a selector, so listeners rebind when the socket changes.
