# HMAC Request Verification

Every API route (and the Socket.IO handshake) is gated by an HMAC-SHA256
signature so the server can verify a request came from a client holding the
shared secret and was not replayed. Source:
[`utils/hmac.ts`](../../src/utils/hmac.ts),
[`middleware/hmac.ts`](../../src/middleware/hmac.ts).

## The Canonical String

Client and server both build the **exact same** string and sign it. The trailing
empty element produces a final newline — it MUST be present:

```ts
// utils/hmac.ts
[method.toUpperCase(), contentType, String(ctime), path, ''].join('\n')
```

The signature is `HMAC-SHA256(stringToSign, HMAC_SECRET)` **Base64-encoded**:

```ts
crypto.createHmac('sha256', config.hmacSecret).update(stringToSign).digest('base64');
```

Fields:

| Field | Value |
| --- | --- |
| `method` | HTTP verb, uppercased (`GET`, `POST`, …) |
| `contentType` | the raw `Content-Type` header (empty string when none) |
| `ctime` | client time, epoch **milliseconds** |
| `path` | request path **after** the API prefix, **no** query string |

## The Middleware

[`middleware/hmac.ts`](../../src/middleware/hmac.ts) mounts on `config.apiPrefix`
in `app.ts`, so it runs for all API routes. It reads two headers — `sig` and
`ctime` — and 401s if either is missing:

```ts
const reason = verifyHmac({
  method: req.method,
  contentType: (req.headers['content-type'] as string) || '', // raw, NOT defaulted
  path: req.url.split('?')[0],   // already prefix-stripped by app.use(apiPrefix, ...)
  ctime,
  sig,
});
if (reason) throw new AppError({ statusCode: 401, errorType: 'AUTHENTICATION_ERROR', ... });
```

Two subtleties that make signatures match:

- **`req.url` is already prefix-stripped** by the `app.use(config.apiPrefix, …)`
  mount, so it equals the path the client signs (the client signs `config.url`
  with no `/api/v1` prefix).
- **Content-Type is taken raw** — not defaulted, not stripped. The client signs
  whatever it actually sends, so the server must do the same.

## `verifyHmac` Checks

[`utils/hmac.ts`](../../src/utils/hmac.ts) returns `null` when valid, else a short
reason string:

1. **Missing signature** → `'missing signature'`.
2. **Timestamp parse** — `Number(ctime)` (not `parseInt`, so `"123abc"` → `NaN`);
   `NaN` → `'invalid timestamp'`.
3. **Freshness** — `|Date.now() - ctime| > 5 min` (`MAX_TIMESTAMP_AGE_MS`) →
   `'timestamp expired'`. This is the replay window.
4. **Length guard** — decoded buffers differing in length →
   `'invalid signature format'` (required before `timingSafeEqual`, which throws
   on length mismatch).
5. **Constant-time compare** — `crypto.timingSafeEqual(sigBuf, expectedBuf)`;
   mismatch → `'invalid signature'`, otherwise `null`.

## Cross-Template Invariant (CRITICAL)

The server signer and the **frontend** signer must produce byte-identical
signatures. The Vue/Nuxt clients sign with CryptoJS in
`templates/vuejs` (and `templates/nuxtjs`) `src/services/core/hmac-signature.ts`:

```ts
// client (CryptoJS)
const stringToSign = [method, contentType, ctime, path, ''].join('\n');
const sig = Base64.stringify(HmacSHA256(stringToSign, secret));
// sent as { sig, ctime, "x-version" } request headers
```

Invariants that MUST stay aligned across templates:

- **Same field order** `[method, contentType, ctime, path, '']` and `\n` joiner
  (the trailing empty element / final newline).
- **Same encoding** — Base64 of the HMAC-SHA256 digest.
- **Same `path`** — relative to the API base (no `/api/v1` prefix, no query).
- **Same `ctime` unit** — epoch **milliseconds**.
- **Same secret** — server `HMAC_SECRET` == client `VITE_HMAC_SECRET`.
- The client default Content-Type is `application/json`; the server signs the raw
  header value (`''` when absent). For requests with a JSON body these coincide.

> Change the canonical string on one side and **all** signed requests fail with
> `401 HMAC verification failed` until the other side matches.

The client also sends an `x-version` header; the server does **not** include it
in the signed string and ignores it for verification.

## See Also

- [realtime-socket.md](./realtime-socket.md) — the socket handshake signs a fixed
  `['GET', 'application/json', ctime, '/socket', '']` contract
- [security-rate-limit.md](./security-rate-limit.md) — HMAC runs before the limiter
