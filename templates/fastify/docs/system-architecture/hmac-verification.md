# HMAC Request Verification

The root Fastify onRequest hook requires HMAC headers on every route under
API_PREFIX. Socket.IO handshakes use the same signer with a fixed path. Source:
[src/utils/hmac.ts](../../src/utils/hmac.ts),
[src/plugins/security.ts](../../src/plugins/security.ts), and
[src/socket/hmac-middleware.ts](../../src/socket/hmac-middleware.ts).

HMAC only proves that a caller knows the shared secret and that the timestamp is
fresh. It does not sign the request body or query string and does not use a
nonce, so a captured signature can be replayed within the five-minute window.
Authorization still depends on access tokens and role checks.

## Canonical request

The client and server sign this exact string, including its final newline:

```text
[METHOD, contentType, ctime, path, ""].join("\\n")
```

The digest is HMAC-SHA256 with HMAC_SECRET, encoded as Base64.

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| METHOD      | HTTP method uppercased                           |
| contentType | Raw Content-Type header, or empty when absent    |
| ctime       | Epoch milliseconds                               |
| path        | Path after API_PREFIX, with query string removed |

Fastify's request URL retains API_PREFIX, so the hook strips the prefix itself
before verification. It preserves the raw content type and excludes the query
string, matching the web clients' signer.

## Verification

verifyHmac() rejects a missing signature, invalid or stale timestamp, malformed
Base64 digest, and signature mismatch. It uses a constant-time comparison after
checking the decoded byte lengths. Timestamps more than five minutes from the
server clock are rejected.

Every API route, including health, registration, and login, requires sig and
ctime. Swagger is mounted outside API_PREFIX. Socket.IO signs GET,
application/json, ctime, and /socket; volatile handshake query values are not
part of the signature.

## Client compatibility

The Vue and Nuxt clients use the same field order, Base64 encoding, millisecond
timestamp, relative API path, and shared HMAC_SECRET. Keep those invariants
aligned with their signer at
templates/vuejs/src/services/core/hmac-signature.ts and
templates/nuxtjs/src/services/core/hmac-signature.ts.

See [realtime-socket.md](./realtime-socket.md) for socket authentication and
[security-rate-limit.md](./security-rate-limit.md) for HTTP security hooks.
