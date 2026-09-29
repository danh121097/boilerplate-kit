# Realtime: Socket.IO

A WebSocket layer attached to the same HTTP server via `@nestjs/websockets`,
gated by the same security model as the REST API (HMAC then JWT). Source:
[`realtime/events.gateway.ts`](../../src/modules/realtime/events.gateway.ts),
[`realtime/socket-io.adapter.ts`](../../src/modules/realtime/socket-io.adapter.ts),
[`realtime/socket-emit.service.ts`](../../src/modules/realtime/socket-emit.service.ts),
[`realtime/events.ts`](../../src/modules/realtime/events.ts).

## Setup

`EventsGateway` is a `@WebSocketGateway()` provider. Its `@WebSocketServer()`
gives access to the Socket.IO `Server`. The socket server **options** (CORS,
heartbeat, payload cap) are not on the decorator — they live in the adapter so
there is a single source of truth.

`configureApp` (called by `main.ts` and the e2e test app) installs
`SocketIoAdapter` **before** `app.listen()`, whether Redis is on or off:

```ts
// app-setup.ts
const redisClient = config.redisEnabled ? app.get(RedisService).getClient() : null;
app.useWebSocketAdapter(new SocketIoAdapter(app, redisClient));
// CRITICAL: useWebSocketAdapter must run before listen() — after it silently no-ops.
```

`SocketIoAdapter.createIOServer` applies the shared socket options
(`buildSocketServerOptions`) and, when a Redis client is given, wires the pub/sub
adapter:

```ts
const server = super.createIOServer(port, {
  ...options,
  ...buildSocketServerOptions(this.corsOrigins),
  // cors: { origin: corsOrigins, credentials: true }, pingInterval: 25000,
  // pingTimeout: 20000, maxHttpBufferSize: 1e6 (1 MB cap on inbound payloads)
});
if (this.pubClient) {
  server.adapter(createAdapter(createSafePubClient(pub, warn), subClient)); // cross-instance delivery
}
```

Notes:

- **Optional, like the rest of the Redis stack.** Without Redis it runs
  single-instance (CORS and the other options still apply); with Redis, `@socket.io/redis-adapter`
  makes emits reach clients on every instance.
- **Ownership** — `pubClient` is the shared client owned by `RedisModule` (never
  quit in the adapter); the `subClient` duplicate is owned by `SocketIoAdapter`,
  which quits it in `close()`.
- **Outage safety** — `@socket.io/redis-adapter` publishes and subscribes
  fire-and-forget, so a rejection there would be an unhandled rejection that exits
  the process. The adapter therefore publishes through `createSafePubClient` (a
  proxy whose `publish` logs a rejection at warn and resolves 0), and the `subClient`
  keeps the offline queue with no retry cap or command timeout
  (`enableOfflineQueue: true, commandTimeout: undefined, maxRetriesPerRequest: null`)
  plus an `error` listener. `SocketEmitService` also wraps every emit/disconnect
  (log at warn); `disconnectUser` drops local sockets first
  (`io.local.in(room)`), then cluster-wide, so this instance honors a revoke even
  during an outage.
- **Per-user rooms** — each connection joins `user:<userId>`, enabling targeted
  emits.
- **Heartbeat + payload cap** drop dead connections and bound memory abuse.

## Handshake Gates (order matters)

`handleConnection` runs two checks on every handshake — **HMAC first, then JWT**
— mirroring the HTTP guard order. Any failure calls `rejectClient` (emit `error`
with `SOCKET_UNAUTHORIZED` = `'Unauthorized!'`, then `disconnect(true)`).

### 1. HMAC gate

Reads `sig` and `ctime` from the handshake `auth` payload and verifies a
**fixed** contract:

```ts
this.hmacService.verifyHmac({
  method: "GET",
  contentType: DEFAULT_CONTENT_TYPE,   // 'application/json' — socket-only default
  ctime,
  path: SOCKET_HMAC_PATH,              // '/socket'
  sig,
});
```

So the client signs `['GET', 'application/json', ctime, '/socket', ''].join('\n')`
— same `verifyHmac` (freshness + timing-safe compare) as HTTP, just a fixed path
with no volatile query. See [hmac-verification.md](./hmac-verification.md).

### 2. JWT gate

Extracts the access token from `handshake.auth.token` (strips a `Bearer ` prefix)
or the `accessToken` cookie, then:

```ts
const payload = this.tokenService.verifyAccessToken(token);
const revokedAt = await this.tokenRevocationService.getUserRevokedAt(payload.userId);
if (isTokenRevoked(payload, revokedAt)) return this.rejectClient(client); // iat_ms < cutoff (ms)
client.data.user = payload;
void client.join(`user:${payload.userId}`);
client.emit(SOCKET_EVENT.AUTHENTICATED);
```

Same `verifyAccessToken` + user-level revocation check as the HTTP JWT step
(revocation is no-op / fail-open when Redis is off). On success
`client.data.user` is populated and the per-user room is joined.

## Events

[`realtime/events.ts`](../../src/modules/realtime/events.ts) is the central event-name
registry (reference these constants instead of string literals):

| Constant | Value | Direction |
| --- | --- | --- |
| `SOCKET_EVENT.AUTHENTICATED` | `'authenticated'` | server → client, on successful handshake |
| `SOCKET_EVENT.PING` | `'ping'` | reserved app event |
| `SOCKET_UNAUTHORIZED` | `'Unauthorized!'` | handshake rejection error message |

## Emitting From Services

[`realtime/socket-emit.service.ts`](../../src/modules/realtime/socket-emit.service.ts) is
an injectable that lets any module push to clients without coupling to the
gateway. Both helpers **no-op** when the server isn't initialized (tests, CLI,
pre-listen) and reach other instances when the Redis adapter is on:

```ts
emitToUser(userId, event, payload);   // gateway.server?.to(`user:${userId}`).emit(...)
emitBroadcast(event, payload);        // gateway.server?.emit(...)
```

`emitToUser` targets the per-user room joined on connection. Inject
`SocketEmitService` anywhere it is needed (it is exported from `RealtimeModule`).
`disconnectUser(userId)` force-disconnects all of a user's sockets (across instances
with Redis); auth calls it on logout and when reuse detection revokes a session
family. It is a no-op when the socket server is not initialised.

## See Also

- [hmac-verification.md](./hmac-verification.md) — the shared signing primitive
- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — `verifyAccessToken` + revocation
- [security-rate-limit.md](./security-rate-limit.md) — Redis / CORS configuration
