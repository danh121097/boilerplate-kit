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
`runtimeConfig.public.hmacSecret` is set), then the bearer token for that
service's slot (null during SSR):

```ts
config.serviceType = service;
config.headers = HeadersUtils.setAuthHeaders(config);      // + sig/ctime/x-version
HeadersUtils.addAuthorizationHeader(config, service);      // Authorization: Bearer <token>
```

**Response** — `onSuccess` unwraps a recognized envelope; non-envelope bodies
pass through raw. Blob responses return the blob (or reject on a non-2xx when
`strictBlobError`). An envelope with `error_code: 401`, and any real 401 in
`onError`, route into the refresh-and-replay path. Full detail in
[Security & Auth](./security-auth.md) and [Error Handling](./error-handling.md).

Envelope recognition is deliberately narrow — only `status: "success"|"error"`
or a boolean `success` counts, so a domain payload like `{ id, status: "done" }`
is never misread as an error.

## TanStack Vue Query Wrappers (`app/services/core/tanstack.ts`)

`defineQuery` / `defineMutation` build reusable, typed query/mutation definitions
with stable key builders.

```ts
export const useUsersListQuery = defineQuery<User[]>({
  key: "users.list",
  fetcher: () => UsersModel.list().then((r) => r.data),
});
```

- `defineQuery` returns a callable that also exposes `.key` and
  `.queryKey(params)`. The key is reactive: `[key]` or `[key, params]`,
  recomputed from a `computed` over `toValue(params)` (a `MaybeRefOrGetter`).
- `defineMutation` takes a `mutator` and optional `invalidates: string[]`; on
  success it invalidates each listed key via the shared `queryClient`, then runs
  any definition-level `options.onSuccess` and per-call `overrides.onSuccess`.

`computed` / `toValue` are Nuxt auto-imports — used without explicit import. See
[State Management](./state-management.md) for keys + invalidation.

## Socket.IO (`app/composables/useSocketIO.ts` + `app/stores/socket-io.ts`)

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

SSR safety is built in:

- The `io()` constructor is lazy/safe on the server (no socket opens until
  `.connect()`).
- `getAuthToken()` returns `null` during SSR, so `buildAuth()` yields an empty
  bearer server-side.
- `connectSocket` runs in `onMounted`, so the handshake only happens on the
  client — never during Nitro render.

Behavior:

- `buildAuth()` attaches the bearer token plus, when `hmacSecret` is set, an HMAC
  `{ sig, ctime }` over the canonical string for `GET /socket` (see
  [Security & Auth](./security-auth.md)).
- Lifecycle: connects `onMounted`, tears down on `onScopeDispose`. Events come
  from the `SOCKET_EVENT` registry (`enums/socket-events.ts`): `authenticated`,
  `unauthorized`, `connect_error`.
- `connect_error` whose message equals `SOCKET_UNAUTHORIZED_MESSAGE`
  (`"Unauthorized!"`) flips `authenticated` false and throttle-reconnects;
  `unauthorized` destroys the socket.
- Helpers: `useIo()` (get/lazy-init the shared socket), `useSocketEvent(event, cb)`
  (auto-unsubscribe on unmount).
