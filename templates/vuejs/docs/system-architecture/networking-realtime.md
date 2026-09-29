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
  withCredentials: true,   // send the httpOnly refresh cookie on every request
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
Verb methods (`get/post/put/patch/delete`, plus `postFormData` which forces
`multipart/form-data`) take an `ApiRequestConfig` and merge optional
`customHeaders`.

## The `Model` Base (`src/services/core/model.ts`)

Domain services subclass `Model` and self-wire in a static block:

```ts
export class UsersModel extends Model {
  static { Model.setup.call(this, { path: "/users", service: "MAIN" }); }
  static list() { return this.api.get<User[]>(); }
  static get(id: number) { return this.api.get<User>({ url: `${this.path}/${id}` }); }
}
```

`Model.setup({ path, service })` builds an `Api` for that service and stores
`path`. The response interceptor unwraps the envelope, so `post<T>` resolves to
the payload `T` — read `.data` once (see `AuthModel.login` returning `res.data`).

## Interceptors (`src/services/core/interceptors.ts`)

`ApiInterceptors` implements `HttpInterceptorSetup`:

**Request** — stamps `config.serviceType`, attaches HMAC signature headers (when
`VITE_HMAC_SECRET` is set), then the bearer token for that service's slot:

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

Envelope recognition is deliberately narrow — only `status: "success"|"error"` or
a boolean `success` counts, so a domain payload like `{ id, status: "done" }` is
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
- `defineMutation` takes a `mutator` and optional `invalidates: string[]`; on
  success it invalidates each listed key via the shared `queryClient`, then runs
  any `options.onSuccess` and per-call `overrides.onSuccess`.

See [State Management](./state-management.md) for keys + invalidation patterns.

## Socket.IO (`composables/useSocketIO.ts` + `stores/socket-io.ts`)

`useSocketIO()` creates a connection scoped to the calling component tree. The
live socket is cached in a Pinia store (`useSocketIOStore`) so the whole app
shares one connection.

```ts
const socket = io(URL, {
  auth: buildAuth(),         // { token: `Bearer <token>`, role: "user", ...signHeader() }
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: false,
  forceBase64: true,
});
```

- `buildAuth()` attaches the bearer token plus, when `VITE_HMAC_SECRET` is set,
  an HMAC `{ sig, ctime }` for `GET /socket`, produced by the core
  `HMACSignatureGenerator.signRequest` (the same signer as HTTP requests).
- Lifecycle: connects `onMounted`, tears down on `onScopeDispose`. The socket is
  opened only while signed in: `components/socket-status.vue` calls
  `useSocketIO()` and `App.vue` renders it in the header (next to Logout) only
  when `isAuthenticated`, so signing out unmounts it and destroys the socket.
  Events come from the `SOCKET_EVENT` registry (`enums/socket-events.ts`):
  `authenticated`, `unauthorized`, `connect_error`, `disconnect`.
- Connection state: `authenticated` in the store becomes `true` only when the
  server emits `authenticated`; it becomes `false` on `connect_error`, on
  `disconnect` and on destroy. `connectSocket()` never sets it.
- Reconnect policy (`RECONNECT_BASE_MS = 2000`, `RECONNECT_MAX_MS = 30_000`):
  - On `connect_error` while `socket.active` is true, socket.io is already
    reconnecting (network error, server down): nothing extra is done.
  - When `socket.active` is false the server rejected the handshake
    (`"Unauthorized!"`: missing, expired or revoked token, or a bad HMAC). One
    manual retry is scheduled (errors while one is pending do not reschedule)
    after `Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)`, then
    `attempt` increments: 2 s, 4 s, 8 s, 16 s, 30 s, 30 s, … The retry rebuilds
    `socket.auth` (fresh token and HMAC `sig` / `ctime`) and calls `connect()`
    on the same socket.
  - A `disconnect` with reason `io server disconnect` (the server closed the socket, e.g. a graceful restart; socket.io does not reconnect on its own) schedules the same retry.
  - `attempt` resets to 0 on `authenticated`. Destroying the socket (unmount, or
    the server `unauthorized` event) clears a pending retry, and nothing
    connects afterwards.
- Header status: `socket-status.vue` shows a `role="status"` dot
  (`size-2 rounded-full`, `bg-emerald-500` when authenticated, otherwise
  `bg-muted-foreground`) with visually hidden text and a `title` from
  `socket.connected` ("Realtime connected") or `socket.reconnecting`
  ("Realtime reconnecting").
- Helpers: `useIo()` (get/lazy-init the shared socket), `useSocketEvent(event, cb)`
  (auto-unsubscribe on unmount). `useSocketEvent` reuses the store's socket and only
  creates one when none exists, so it never opens a second connection next to the
  header status.
