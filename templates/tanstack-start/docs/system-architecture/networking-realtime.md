# Networking

## Request flow

```
Route component
  → useUsersListQuery()          defineQuery hook
  → UsersModel.list()            Model method
  → Api.get<User[]>()            axios instance
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
export const useUsersListQuery = defineQuery<User[]>({
  key: "users.list",
  fetcher: async () => (await UsersModel.list()).data,
});
```

- `.key` — string key used for cache lookup and invalidation.
- `.queryKey(params?)` — builds the full query key array.
- `defineMutation({ invalidates: ["users.list"] })` — auto-invalidates on success.
