# HMAC Request Verification

Every route (and the Socket.IO handshake) is gated by an HMAC-SHA256 signature so
the server can reject requests from clients that do not hold the shared secret
and bound how long a captured signature stays usable. Source:
[`common/services/hmac.service.ts`](../../src/common/services/hmac.service.ts),
[`common/guards/security.guard.ts`](../../src/common/guards/security.guard.ts).

> **Scope:** HMAC is an anti-abuse / light-integrity layer, **not a security
> boundary**. A secret shipped into a browser bundle or a mobile app is public, so
> anyone can sign requests. The body and query string are not signed and there is
> no nonce: a captured signature replays freely inside the ±5-minute window.
> Authorization rests on the JWT.
>
> **Failures:** a missing, malformed, stale or wrong signature is a `401` with
> `errorType: "HMAC_ERROR"` (distinct from `AUTHENTICATION_ERROR`, so clients can
> tell a signing problem from a bad session and should not try to refresh). A
> client clock more than 5 minutes off the server fails as `timestamp expired`.

## The Canonical String

Client and server both build the **exact same** string and sign it. The trailing
empty element produces a final newline — it MUST be present:

```ts
// common/services/hmac.service.ts
[method.toUpperCase(), contentType, String(ctime), path, ""].join("\n");
```

The signature is `HMAC-SHA256(stringToSign, HMAC_SECRET)` **Base64-encoded**:

```ts
crypto.createHmac("sha256", config.hmacSecret).update(stringToSign).digest("base64");
```

Fields:

| Field         | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| `method`      | HTTP verb, uppercased (`GET`, `POST`, …)                   |
| `contentType` | the raw `Content-Type` header (empty string when none)     |
| `ctime`       | client time, epoch **milliseconds**                        |
| `path`        | request path **after** the API prefix, **no** query string |

## The HMAC Step (in `SecurityGuard`)

There is no separate HMAC middleware — it is **step 1** of the composite
`SecurityGuard`, so it runs for **every** route (including `@Public` and
`/health`). It reads two headers — `sig` and `ctime` — and 401s (`HMAC_ERROR`) if either is
missing:

```ts
const path = derivePath(req.originalUrl, this.config.apiPrefix);
const reason = this.hmacService.verifyHmac({
  method: req.method,
  contentType: (req.headers["content-type"] as string) ?? "",  // raw, NOT defaulted
  ctime,
  path,
  sig,
});
if (reason) throw new AppException({ statusCode: 401, errorType: "HMAC_ERROR", ... });
```

### Path derivation (the NestJS subtlety)

Unlike Express `app.use(prefix, …)` — which pre-strips the prefix from `req.url`
— `setGlobalPrefix` does **not** strip the API prefix from `req.originalUrl`
inside a guard. So the guard derives the signed path manually with `derivePath`:

```ts
// guards/derive-path.ts — exported for unit testing
export function derivePath(originalUrl: string, apiPrefix: string): string {
  const prefix = apiPrefix.startsWith("/") ? apiPrefix : `/${apiPrefix}`;
  const withoutQuery = originalUrl.split("?")[0]; // 1. drop query string
  return withoutQuery.startsWith(prefix)
    ? withoutQuery.slice(prefix.length) || "/" // 2. strip the prefix
    : withoutQuery;
}
// "/api/v1/auth/login?foo=bar"  →  "/auth/login"
```

So the signed `path` equals what the client signs (its base-relative path with no
`/api/v1` prefix and no query).

- **Content-Type is taken raw** — not defaulted, not stripped. The client signs
  whatever it actually sends, so the server must too. (`DEFAULT_CONTENT_TYPE` is
  socket-only — never used for HTTP.)

## `verifyHmac` Checks

[`hmac.service.ts`](../../src/common/services/hmac.service.ts) returns `null` when valid,
else a short reason string:

1. **Missing signature** → `'missing signature'`.
2. **Timestamp parse** — `Number(ctime)` (so `"123abc"` → `NaN`); `NaN` →
   `'invalid timestamp'`.
3. **Freshness** — `|Date.now() - ctime| > 5 min` (`MAX_TIMESTAMP_AGE_MS`) →
   `'timestamp expired'`. This is the replay window.
4. **Length guard** — decoded buffers differing in length →
   `'invalid signature format'` (required before `timingSafeEqual`, which throws
   on length mismatch).
5. **Constant-time compare** — `crypto.timingSafeEqual(sigBuf, expectedBuf)`;
   mismatch → `'invalid signature'`, otherwise `null`.

## Cross-Template Invariant (CRITICAL)

The server signer and the **frontend** signer must produce byte-identical
signatures. The Vue/Nuxt clients sign with CryptoJS in `templates/vuejs` (and
`templates/nuxtjs`) `src/services/core/hmac-signature.ts`:

```ts
// client (CryptoJS)
const stringToSign = [method, contentType, ctime, path, ""].join("\n");
const sig = Base64.stringify(HmacSHA256(stringToSign, secret));
// sent as { sig, ctime, "x-version" } request headers
```

Invariants that MUST stay aligned across templates:

- **Same field order** `[method, contentType, ctime, path, '']` and `\n` joiner.
- **Same encoding** — Base64 of the HMAC-SHA256 digest.
- **Same `path`** — relative to the API base (no `/api/v1` prefix, no query).
- **Same `ctime` unit** — epoch **milliseconds**.
- **Same secret** — server `HMAC_SECRET` == client `VITE_HMAC_SECRET`.
- The client default Content-Type is `application/json`; the server signs the raw
  header value (`''` when absent). For requests with a JSON body these coincide.

> Change the canonical string on one side and **all** signed requests fail with
> `401 HMAC verification failed` until the other side matches. The server signer
> and the e2e helper are kept aligned by
> `test/unit/hmac-signer-parity.spec.ts`.

The client also sends an `x-version` header; the server does **not** include it
in the signed string and ignores it for verification.

> **Swagger note:** development Swagger UI signs "Try it out" requests in the
> browser, so protected routes only need a Bearer token entered through
> "Authorize". Other environments do not serve the HMAC secret to Swagger.
> Docs are off in production unless `DOCS_ENABLED=true`.

## See Also

- [realtime-socket.md](./realtime-socket.md) — the socket handshake signs a fixed
  `['GET', 'application/json', ctime, '/socket', '']` contract
- [security-rate-limit.md](./security-rate-limit.md) — the throttler runs before HMAC (rejected requests still count)
