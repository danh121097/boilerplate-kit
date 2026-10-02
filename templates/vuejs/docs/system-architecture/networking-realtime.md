# Networking & Realtime

The data layer: one shared `Api` client serving many backends, a `Model` base for
domain services, injectable interceptors, TanStack Vue Query wrappers, and a
Socket.IO connection scoped to the component tree.

## The `Api` Client (`src/services/core/api.ts`)

A single class backs every backend. Services are keyed by an `ApiService` name
("MAIN" by default); each axios instance resolves its base URL **lazily** so
`initServices()` can register URLs after construction.

```ts
this.http = axios.create({
  headers: { "Content-Type": "application/json", Accept: "*/*" },
  withCredentials: true,   // lets the browser send the backend's refresh cookie; this client does not rely on it
  timeout: 30_000,
});
// lazy baseURL: filled per-request from the static registry
this.http.interceptors.request.use((req) => {
  if (!req.baseURL) req.baseURL = Api.getBaseURL(this.service);
  return req;
});
```

Static state is shared across all instances:

- `Api.setBaseURL(url, service)` / `Api.getBaseURL(service)` — per-service base URL map.
- `Api.registerInterceptors(setup)` — the one `HttpInterceptorSetup` used by all.

Interceptors are applied **once, lazily** on first request via `ensureInterceptors()`.
Verb methods (`get/post/put/patch/delete`) take an `ApiRequestConfig` and merge
optional `customHeaders`.

## The `Model` Base (`src/services/core/model.ts`)

Domain services subclass `Model` and self-wire in a static block:

```ts
export class UsersModel extends Model {
  static { Model.setup.call(this, { path: usersContract.base, service: usersContract.service }); }
  static list(params?: PaginationParams) {
    return this.api.paginate<User>({ url: usersContract.paths.list, params });
  }
  static async get(id: string) {
    return (await this.api.get<User>({ url: usersContract.paths.byId(id) })).data;
  }
}
```

`Model.setup({ path, service })` builds an `Api` for that service and stores
`path`. The response interceptor unwraps the envelope, so `post<T>` resolves to
the payload `T` — read `.data` once (see `AuthModel.login` returning `res.data`).

## Interceptors (`src/services/core/interceptors.ts`)

`ApiInterceptors` implements `HttpInterceptorSetup`:

**Request** — stamps `config.serviceType`, attaches HMAC signature headers (when
`VITE_HMAC_SECRET` is set; the bundled backends require it), then the bearer token for that service's slot:

```ts
config.serviceType = service;
config.headers = HeadersUtils.setAuthHeaders(config);      // + sig/ctime/x-version
HeadersUtils.addAuthorizationHeader(config, service);      // Authorization: Bearer <token>
```

**Response** — `onSuccess` unwraps a recognized envelope; non-envelope bodies pass
through raw. Blob responses return the blob (or reject on a non-2xx when
`strictBlobError`). An envelope with `error_code: 401`, and any real 401 in
`onError`, route into the refresh-and-replay path. Full detail in
[Security & Auth](./security-auth.md) and [Error Handling](./error-handling.md).

Envelope recognition is deliberately narrow — only a boolean `success`
counts, so a domain payload like `{ id, status: "done" }` is
never misread as an error.

## TanStack Vue Query Wrappers (`src/services/core/tanstack.ts`)

`defineQuery` / `defineMutation` build reusable, typed query/mutation
definitions with stable key builders.

```ts
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: "users.list",
  fetcher: () => UsersModel.list(),
});
```

- `defineQuery` returns a callable that also exposes `.key` and
  `.queryKey(params)`. The query key is reactive: `[key]` or `[key, params]`,
  recomputed from a `MaybeRefOrGetter` `params`.
- `.queryOptions(params?)` — plain options (key, fetcher, `staleTime`, `select`, …) for
  `ensureQueryData` / prefetch. The fetcher receives `(params, { signal })`; pass `signal` to the
  request to cancel it.
- `defineMutation` (`tanstack-mutation.ts`) takes a `mutator` and optional
  `invalidates: (string | QueryKey)[]` (a string is a key prefix, an array one exact key), awaited
  on success before the callbacks. Hook overrides (`onMutate/onSuccess/onError/onSettled`) run after,
  and never replace, the definition's `options` callbacks. `.mutationOptions()` exposes the options.
- `defineMutation({ optimistic: { queryKey, update } })` — opt-in optimistic cache edit, rolled back
  on error; invalidation moves to settle and waits for sibling mutations on the same keys (helpers
  in `tanstack-optimistic.ts`).

See [State Management](./state-management.md) for keys + invalidation patterns.

## Socket.IO (`composables/useSocketIO.ts` + `stores/socket-io.ts`)

`useSocketIO()` creates a connection scoped to the calling component tree. The
live socket is cached in a Pinia store (`useSocketIOStore`) so the whole app
shares one connection.

```ts
const socket = io(getApiOrigin(), {
  auth: (cb) => cb(buildAuth()), // runs on every connect and reconnect
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: false,
  forceBase64: true,
});
```

- `buildAuth()` (`services/core/socket-connection.ts`) returns
  `{ token: "Bearer <access token>", sig, ctime }`. `token` is present only while
  signed in (never an empty `Bearer`). `sig` / `ctime` sign `GET /socket` with the
  core `HMACSignatureGenerator.signRequest` (the same signer as HTTP requests) and
  are present when `VITE_HMAC_SECRET` is set. `auth` is a callback, so every
  attempt carries a new `ctime` and the current token. There is no `role` claim:
  the backend reads only `sig`, `ctime` and `token`, and takes the role from the JWT.
- Lifecycle: connects `onMounted` (only while an access token exists), tears down
  on `onScopeDispose`. The socket is
  opened only while signed in: `components/socket-status.vue` calls
  `useSocketIO()` and `App.vue` renders it in the header (next to Logout) only
  when `isAuthenticated`, so signing out unmounts it and destroys the socket.
  Events come from the `SOCKET_EVENT` registry (`enums/socket-events.ts`):
  `authenticated`, `ping`, `connect_error`, `disconnect`.
- Connection state: `authenticated` in the store becomes `true` only when the
  server emits `authenticated`; it becomes `false` on `connect_error`, on
  `disconnect` and on destroy. `connectSocket()` never sets it.
- Reconnect policy (`attachSocketLifecycle`; `RECONNECT_BASE_MS = 2000`,
  `RECONNECT_MAX_MS = 30_000`, `MAX_REFRESH_ATTEMPTS = 3`):
  - On `connect_error` while `socket.active` is true, socket.io is already
    reconnecting (network error, server down): nothing extra is done.
  - When `socket.active` is false the server rejected the handshake. For
    `"Unauthorized!"` carrying `data.errorType` `HMAC_ERROR` (bad signature or
    clock, not the session) nothing is refreshed and no refresh is counted: it
    takes the timed retry below and logs the same dev-only hint as an HTTP
    `HMAC_ERROR`. For any other `"Unauthorized!"` (missing, expired or revoked
    token) the session is refreshed once through the shared single-flight refresh
    (`refreshSession`) and the socket reconnects once with the new token. A
    refused refresh ends the session and stops; a transient refresh failure falls
    back to the timed retry below.
  - At most 3 refreshes are made per outage; the count resets on `authenticated`.
    Once spent, or for any other rejection (and every HMAC rejection), a single retry timer reconnects
    **without refreshing** after `Math.min(RECONNECT_BASE_MS * 2 ** attempt,
    RECONNECT_MAX_MS)`, then `attempt` increments: 2 s, 4 s, 8 s, 16 s, 30 s,
    30 s, … Each retry rebuilds `auth` (current token, fresh `ctime`). Errors
    while a timer is pending do not reschedule.
  - A `disconnect` with reason `io server disconnect` (the server closed the socket, e.g. a graceful restart; socket.io does not reconnect on its own) schedules the same timed retry.
  - `attempt` and the refresh count reset on `authenticated`. Destroying the
    socket (unmount or sign-out) clears a pending retry and abandons a refresh in
    flight, and nothing connects afterwards.
  - **Known limit:** there is no timer-based refresh (it would burn the backend's
    shared auth rate limit). After the 3 refreshes are spent, an idle socket keeps
    retrying with the stored token and only reconnects once an HTTP call has
    refreshed it.
- Header status: `socket-status.vue` shows a `role="status"` dot
  (`size-2 rounded-full`, `bg-emerald-500` when authenticated, otherwise
  `bg-muted-foreground`) with visually hidden text and a `title` from
  `socket.connected` ("Realtime connected") or `socket.reconnecting`
  ("Realtime reconnecting").
- Helpers: `useIo()` (get/lazy-init the shared socket), `useSocketEvent(event, cb)`
  (auto-unsubscribe on unmount). `useSocketEvent` reuses the store's socket and only
  creates one when none exists, so it never opens a second connection next to the
  header status.
