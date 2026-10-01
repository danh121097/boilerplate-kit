# HMAC Request Verification

The root Fastify onRequest hook requires HMAC headers on every route under
API_PREFIX. Socket.IO handshakes use the same signer with a fixed path. Source:
[src/utils/hmac.ts](../../src/utils/hmac.ts),
[src/plugins/security.ts](../../src/plugins/security.ts), and
[src/socket/hmac-middleware.ts](../../src/socket/hmac-middleware.ts).

HMAC is an anti-abuse and light integrity layer, **not a security boundary**. It
only proves that a caller knows the shared secret and that the timestamp is fresh,
and a secret shipped into a browser or app bundle is public. It does not sign the
request body or query string and uses no body hash or nonce, so a captured
signature can be replayed within the ±5 minute `ctime` window. Authorization still
depends on access tokens and role checks.

A failed check answers `401` with `errorType: "HMAC_ERROR"` (distinct from
`AUTHENTICATION_ERROR`, so a client does not treat a bad signature or clock skew as
a dead session). A client whose clock is more than five minutes off gets
`HMAC_ERROR` on every request until the clock is fixed. A Socket.IO handshake
rejects with the generic `Unauthorized!` connect error instead.

## Canonical request

The client and server sign this exact string, including its final newline:

```text
[METHOD, contentType, ctime, path, ""].join("\n")
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

The bundled frontend clients use the same field order, Base64 encoding,
millisecond timestamp, relative API path, and shared HMAC_SECRET (their build-time
copy). Keep those invariants aligned with their signer at
templates/<frontend>/.../services/core/hmac-signature.ts (under src/, or app/ in
nuxtjs).

See [realtime-socket.md](./realtime-socket.md) for socket authentication and
[security-rate-limit.md](./security-rate-limit.md) for HTTP security hooks.
