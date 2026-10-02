# Realtime: Socket.IO

A WebSocket layer attached to the same HTTP server, gated by the same security
model as the REST API (HMAC then JWT). Source:
[`socket/index.ts`](../../src/socket/index.ts),
[`socket/hmac-middleware.ts`](../../src/socket/hmac-middleware.ts),
[`socket/auth-middleware.ts`](../../src/socket/auth-middleware.ts),
[`socket/events.ts`](../../src/socket/events.ts),
[`utils/socket-emit.ts`](../../src/utils/socket-emit.ts).

## Setup

[`socket/index.ts`](../../src/socket/index.ts) `initSocket(httpServer)` is called
from `server.ts` after the HTTP server is created:

```ts
io = new Server(httpServer, {
  cors: { origin: config.corsOrigins, credentials: true },
  allowRequest, // ENABLE_CSRF origin rule on the handshake / upgrade (see below)
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6, // 1 MB cap on inbound payloads
});

const pub = getRedis();
if (pub) {
  subClient = pub.duplicate();
  io.adapter(createAdapter(pub, subClient)); // cross-instance delivery when Redis on
}

io.use(socketHmac); // 1. HMAC signature + ctime window
io.use(socketAuth); // 2. identity gate
io.on("connection", (socket) => {
  const userId = socket.data.user?.userId;
  if (userId) socket.join(`user:${userId}`); // per-user room
  socket.emit(SOCKET_EVENT.AUTHENTICATED);
});
```

Notes:

- **Optional, like the rest of the realtime/Redis stack.** Without Redis it runs
  single-instance; with Redis a pub/sub adapter (`@socket.io/redis-adapter`) makes
  emits reach clients on every instance. `sub` is a duplicated connection owned by
  the socket layer (`quit` in `closeSocket`); `pub` is the shared app client
  (never quit here, to avoid double-close).
- **Per-user rooms** — each connection joins `user:<userId>`, enabling targeted
  emits.
- **Heartbeat + payload cap** drop dead connections and bound memory abuse.
- **Sessions end sockets.** Logout (when the refresh token is known) and a
  detected refresh-token reuse call `disconnectUserSockets(userId)`, which
  force-disconnects every socket in that user's room (across instances with the
  Redis adapter); it no-ops when the socket server is not initialised.
- `closeSocket()` force-disconnects live sockets (`io.disconnectSockets(true)`)
  before `io.close()`, since `close()` alone does not drop active websockets.

## Handshake Origin Check

`cors` only sets response headers; it does not stop a cross-site page from opening a
WebSocket with the user's cookies. With `ENABLE_CSRF=true`, `allowRequest` runs
`isOriginAllowed` ([`middleware/verify-origin.ts`](../../src/middleware/verify-origin.ts)),
the same predicate as the HTTP CSRF guard, on the handshake / upgrade request: no
`Cookie`, `Origin` or `Referer` passes (native clients); otherwise the `Origin` (or
`Referer` origin) must be in `corsOrigins`. The handshake alone also passes when the
`Origin` host (`new URL(origin).host`) equals the request's `Host` header,
case-insensitively and port included: React Native's WebSocket sends the API's own
origin and may attach cookies from its jar, which a cross-site page cannot forge. A
different port, `Origin: null` or a malformed `Origin` is not same-origin; a foreign
`Origin`, a `Cookie` without `Origin`, or a foreign `Referer` is still refused. A rejection is an HTTP `403` before any
Socket.IO middleware runs; with `ENABLE_CSRF` off the check is skipped.

Behind a reverse proxy the `Host` header must reach the app unchanged (nginx:
`proxy_set_header Host $host;`, or the proxy's "preserve host" option). The rule
compares against the raw `Host` only (`X-Forwarded-Host` is never read), so a proxy
that rewrites it to the upstream name makes the comparison fail and React Native
sockets get `403` while `ENABLE_CSRF=true`.

## Handshake Gates (order matters)

Two middleware run on every handshake — **HMAC first, then JWT** — mirroring the
HTTP pipeline. Both reject with the message `SOCKET_UNAUTHORIZED` (`'Unauthorized!'`); only an
HMAC rejection also carries `data`, so a client can tell the two apart (see
[Rejection shape](#rejection-shape)).

### 1. `socketHmac`

[`socket/hmac-middleware.ts`](../../src/socket/hmac-middleware.ts) reads `sig` and
`ctime` from the handshake `auth` payload and verifies a **fixed** contract:

```ts
verifyHmac({
  method: "GET",
  contentType: DEFAULT_CONTENT_TYPE, // 'application/json'
  ctime,
  path: SOCKET_HMAC_PATH, // '/socket'
  sig,
});
```

So the client signs `['GET', 'application/json', ctime, '/socket', ''].join('\n')`
— same `verifyHmac` (freshness + timing-safe compare) as HTTP, just a fixed path
with no volatile query. A failure (missing `sig` or `ctime`, invalid or
expired signature, non-numeric or stale `ctime`) is the `Unauthorized!` connect error
with `data: { errorType: "HMAC_ERROR" }`. `ctime` must be fresh, so a reconnecting client re-signs each
handshake. See [hmac-verification.md](./hmac-verification.md).

### 2. `socketAuth`

[`socket/auth-middleware.ts`](../../src/socket/auth-middleware.ts) extracts the
access token from `handshake.auth.token` (strips a `Bearer ` prefix) or falls back
to the `accessToken` cookie, then:

```ts
const decoded = verifyAccessToken(token);
const revokedAt = await getUserRevokedAt(decoded.userId);
if (isAccessTokenRevoked(decoded, revokedAt)) return next(new Error(SOCKET_UNAUTHORIZED)); // iat_ms vs cutoff (ms)
socket.data.user = decoded;
```

Same `verifyAccessToken` + user-level revocation check as the HTTP `authenticate`
middleware (revocation is a no-op when Redis is off). On success
`socket.data.user` is populated for handlers.

The handshake reads **only** `auth.sig`, `auth.ctime` and `auth.token` (or the
cookie). It reads no `auth.role`: the role comes from the verified JWT in
`socket.data.user`, never from client input.

### Rejection shape

Both gates fail the handshake with `error.message === "Unauthorized!"`. Socket.IO
forwards `error.data` to the client's `connect_error` handler:

| Rejected by                                                 | `err.message`   | `err.data`                    |
| ----------------------------------------------------------- | --------------- | ----------------------------- |
| `socketHmac` (missing/invalid/expired signature or `ctime`) | `Unauthorized!` | `{ errorType: "HMAC_ERROR" }` |
| `socketAuth` (missing, invalid, expired or revoked token)   | `Unauthorized!` | none                          |

`HMAC_ERROR` is the same `errorType` the HTTP HMAC gate returns. A client seeing it
should fix its signature or clock and reconnect, not spend a token refresh: the
session is fine.

## Events

[`socket/events.ts`](../../src/socket/events.ts) is the central event-name registry
(reference these constants instead of string literals; the emit helpers only
accept names declared here):

| Constant                     | Value             | Direction                                |
| ---------------------------- | ----------------- | ---------------------------------------- |
| `SOCKET_EVENT.AUTHENTICATED` | `'authenticated'` | server → client, on successful handshake |
| `SOCKET_EVENT.PING`          | `'ping'`          | registry entry only; no handler is wired |
| `SOCKET_UNAUTHORIZED`        | `'Unauthorized!'` | handshake rejection error message        |

`authenticated` is the only event the server emits on its own; no `unauthorized` or
`notification` event exists. A rejected handshake surfaces to the client as a
`connect_error` with the `Unauthorized!` message (plus `data.errorType` for HMAC).

## Emitting From Services

[`utils/socket-emit.ts`](../../src/utils/socket-emit.ts) lets any module push to
clients without importing the Socket.IO server. Both helpers **no-op** when the
socket layer isn't initialized (tests, CLI scripts) and reach other instances when
the Redis adapter is on:

```ts
emitToUser(userId, event, payload); // getIO()?.to(`user:${userId}`).emit(...)
emitBroadcast(event, payload); // getIO()?.emit(...)
disconnectUserSockets(userId); // getIO()?.in(`user:${userId}`).disconnectSockets(true)
```

`emitToUser` targets the per-user room joined on connection.

All three helpers catch synchronous throws and promise rejections and log them at
`warn`; `disconnectUserSockets` drops this instance's sockets first, then the
cluster-wide ones. The adapter is handed a client view whose `publish` failures are
logged (the adapter fires publishes without catching them), and its duplicated
subscriber has an `error` listener plus an offline queue with no retry cap, so a
Redis outage never produces an unhandled rejection or exits the process.

During an outage the cross-instance publish cannot go out: a logout disconnects the
user's sockets on the instance that handled it, but sockets on other instances stay
connected, and emits reach only local sockets. Those sockets are not re-authenticated
until they reconnect.

## See Also

- [hmac-verification.md](./hmac-verification.md) — the shared signing primitive
- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — `verifyAccessToken` + revocation
- [security-rate-limit.md](./security-rate-limit.md) — Redis / CORS configuration
