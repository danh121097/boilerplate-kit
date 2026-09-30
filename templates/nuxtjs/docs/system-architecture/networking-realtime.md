# Networking & Realtime

The data layer: one shared `Api` client serving many backends, a `Model` base for
domain services, injectable interceptors, TanStack Vue Query wrappers, and a
Socket.IO connection scoped to the component tree. All of it is SSR-aware — see
[SSR & Runtime Config](./ssr-and-runtime-config.md).

## The `Api` Client (`app/services/core/api.ts`)

A single class backs every backend, keyed by an `ApiService` name ("MAIN" by
default). Each axios instance resolves its base URL **lazily** so
`01.init-services.ts` can register URLs after construction:

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

Interceptors apply **once, lazily** on first request via `ensureInterceptors()`.
Verb methods (`get/post/put/patch/delete`, plus `postFormData` which forces
`multipart/form-data`) take an `ApiRequestConfig` and merge optional
`customHeaders`.

## The `Model` Base (`app/services/core/model.ts`)

Domain services subclass `Model` and self-wire in a static block:

```ts
export class UsersModel extends Model {
  static { Model.setup.call(this, { path: "/users" }); }
  static list() { return this.api.get<User[]>(); }
  static get(id: number) { return this.api.get<User>({ url: `${this.path}/${id}` }); }
}
```

`Model.setup({ path, service? })` builds an `Api` for that service (default
`"MAIN"`) and stores `path`. The response interceptor unwraps the envelope, so
`post<T>` resolves to the payload `T` — read `.data` once (see `AuthModel.login`
returning `res.data`).

## Interceptors (`app/services/core/interceptors.ts`)

`ApiInterceptors` implements `HttpInterceptorSetup`:

**Request** — stamps `config.serviceType`, attaches HMAC signature headers (when
`runtimeConfig.public.hmacSecret` is set). No Authorization header: the
browser sends the httpOnly auth cookies (`withCredentials`):

```ts
config.serviceType = service;
config._sentAt ??= Date.now();                              // cross-tab "already refreshed?" check
config.headers = HeadersUtils.setAuthHeaders(config);      // + sig/ctime/x-version
```

**Response** — `onSuccess` unwraps a recognized envelope; non-envelope bodies
pass through raw. Blob responses return the blob (or reject on a non-2xx when
`strictBlobError`). An envelope with `error_code: 401`, and any real 401 in
`onError`, route into the refresh-and-replay path. Full detail in
[Security & Auth](./security-auth.md) and [Error Handling](./error-handling.md).

Envelope recognition is deliberately narrow — only a boolean `success`
counts, so a domain payload like `{ id, status: "done" }`
is never misread as an error.

## TanStack Vue Query Wrappers (`app/services/core/tanstack.ts`)

`defineQuery` / `defineMutation` build reusable, typed query/mutation definitions
with stable key builders.

```ts
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: "users.list",
  fetcher: () => UsersModel.list(),
});
```

- `defineQuery` returns a callable that also exposes `.key` and
  `.queryKey(params)`. The key is reactive: `[key]` or `[key, params]`,
  recomputed from a `computed` over `toValue(params)` (a `MaybeRefOrGetter`).
- `serverFetcher` (optional) — the SSR read, used instead of `fetcher` when
  `isServerRender` (`render-env.ts`, `import.meta.server`) is true; it must resolve to the same `TData`. Keep `fetcher` for the browser (axios
  Model, refreshes on 401). A page resolves the query during SSR with `useServerRenderedQuery`
  (`tanstack-ssr.ts`). Actions (mutations) stay client-only.
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

`computed` / `toValue` are Nuxt auto-imports — used without explicit import. See
[State Management](./state-management.md) for keys + invalidation.

## Socket.IO (`app/composables/useSocketIO.ts` + `app/stores/socket-io.ts`)

The socket is opened only while signed in: `components/socket-status.vue` calls
`useSocketIO()` and the default layout renders it, inside `<ClientOnly>` (the socket
stays client-only), next to the Logout button only when the session exists. Signing
out unmounts it, which destroys the socket.

`useSocketIO()` creates a connection scoped to the calling component tree. The
live socket is cached in a Pinia store (`useSocketIOStore`) so the whole app
shares one connection.

```ts
const socket = io(URL, {
  auth: buildAuth(),         // { role: "user", ...signHeader() } — the httpOnly cookie authenticates
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: false,
  forceBase64: true,
});
```

### Header status

`<SocketStatus>` shows a small dot (`size-2 rounded-full`; `bg-emerald-500` when
`authenticated`, `bg-muted-foreground` otherwise) in a `role="status"` wrapper with a
visually hidden label and a `title`: `socket.connected` ("Realtime connected") or
`socket.reconnecting` ("Realtime reconnecting"), in en and ja.

SSR safety is built in:

- The `io()` constructor is lazy/safe on the server (no socket opens until
  `.connect()`).
- `connectSocket` runs in `onMounted`, so the handshake only happens on the
  client — never during Nitro render.

Behavior:

- `buildAuth()` carries no token (the browser sends the httpOnly access cookie via
  `withCredentials`) plus, when `hmacSecret` is set, an HMAC
  `{ sig, ctime }` from the core `HMACSignatureGenerator.signRequest` (the same
  generator the HTTP interceptor uses) over the canonical string for `GET /socket` (see
  [Security & Auth](./security-auth.md)).
- Lifecycle: connects `onMounted`, tears down on `onScopeDispose` (which also
  clears a pending retry timer). Events come from the `SOCKET_EVENT` registry
  (`enums/socket-events.ts`): `authenticated`, `unauthorized`, `disconnect`,
  `connect_error`.
- Connection state: `authenticated` in the store becomes `true` only when the
  server emits `authenticated`. It becomes `false` on `connect_error`, on
  `disconnect` and on destroy. `connectSocket()` never sets it to `true`.
- Reconnect policy (`RECONNECT_BASE_MS = 2000`, `RECONNECT_MAX_MS = 30_000`): on
  `connect_error`, if `socket.active` is true socket.io is already reconnecting
  (network error, server down) and nothing extra runs. If it is false the server
  rejected the handshake (`"Unauthorized!"`: missing/expired/revoked token or bad
  HMAC): one manual retry is scheduled (errors while it is pending do not
  reschedule) after `min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)` —
  2s, 4s, 8s, 16s, 30s, 30s, … The retry rebuilds `socket.auth` (fresh HMAC
  `sig`/`ctime`) and calls `connect()` on the same socket. A `disconnect` with reason `io server disconnect` (the server closed the socket, e.g. a graceful restart; socket.io does not reconnect on its own) schedules the same retry. `attempt` resets to 0
  on `authenticated`. The server's `unauthorized` event destroys the socket.
- Helpers: `useIo()` (get/lazy-init the shared socket), `useSocketEvent(event, cb)`
  (auto-unsubscribe on unmount).
