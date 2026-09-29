# Authentication: JWT + Refresh Rotation

Token-based auth with short-lived access tokens and rotating, DB-tracked refresh
tokens delivered as httpOnly cookies. Source:
[`utils/jwt.ts`](../../src/utils/jwt.ts), [`utils/cookie.ts`](../../src/utils/cookie.ts),
[`models/refresh-token.ts`](../../src/models/refresh-token.ts),
[`modules/auth/service.ts`](../../src/modules/auth/service.ts),
[`middleware/auth.ts`](../../src/middleware/auth.ts),
[`utils/token-revocation.ts`](../../src/utils/token-revocation.ts).

## Two Token Types

| | Access token | Refresh token |
| --- | --- | --- |
| Algorithm | **RS256** (RSA private/public keypair) | **HS256** (symmetric secret) |
| Lifetime | `JWT_ACCESS_EXPIRY` (default `15m`) | `JWT_REFRESH_EXPIRY` (default `7d`) |

Both expiries must match `<positive integer><s|m|h|d>` (`15m`, `7d`); anything
else (`900`, `1w`, `0`, `-5m`) fails boot with a clear message.

| Sent as | `Authorization: Bearer` **or** `accessToken` cookie | `refreshToken` httpOnly cookie |
| Stored server-side | no | yes — SHA-256 hash in `RefreshToken` collection |
| `token_use` claim | `access` | `refresh` |
| `iss` (issuer) claim | primary CORS origin | primary CORS origin |

Access tokens use **RS256** (asymmetric): signed with the RSA private key and
verifiable by any party holding the public key — the right tool when a token may
be checked by many resource servers. Refresh tokens use **HS256** (symmetric),
signed with `JWT_REFRESH_SECRET`, because they are **only ever verified by this
auth server** and never handed to third parties; a symmetric secret is the
correct, simpler choice there. This is an intentional separation of concerns, not
an inconsistency. Refresh validity is established by the DB hash lookup
(`isRevoked` + `expiresAt`); the server does not re-verify the HS256 signature. The two types also
differ by the `token_use` claim, expiry, and that refresh tokens are DB-tracked, delivered in an httpOnly cookie, rotated, and
reuse-detected. The `token_use` claim and the `iss` (issuer) claim are defense in
depth: a refresh token can never satisfy access verification, and a token minted
for another origin/deployment is rejected.
Issuer is a single
canonical value (`TOKEN_ISSUER` = the primary CORS origin); when no origin is
configured it is `undefined`, which disables the check on BOTH sign and verify
(jsonwebtoken skips an undefined issuer) so local/dev setups keep working.

```ts
// utils/jwt.ts — TOKEN_ISSUER is set on sign AND enforced on verify
const TOKEN_ISSUER = Array.isArray(config.corsOrigins)
  ? config.corsOrigins[0]
  : config.corsOrigins;

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, token_use: 'access' }, config.jwtAccessPrivateKey, {
    algorithm: 'RS256',
    issuer: TOKEN_ISSUER,
    expiresIn: config.jwtAccessExpiry,
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, token_use: 'refresh' }, config.jwtRefreshSecret, {
    algorithm: 'HS256',
    issuer: TOKEN_ISSUER,
    expiresIn: config.jwtRefreshExpiry,
    jwtid: crypto.randomUUID(),   // unique jti → two tokens are never byte-identical
  });
}
```

`verifyAccessToken` pins `algorithms: ['RS256']` and verifies against
`config.jwtAccessPublicKey`, enforces the `issuer` and asserts
`token_use=access` — throwing otherwise. Verification order: signature →
algorithm → issuer → `token_use`. Refresh tokens have no verify helper: validity
comes from the DB lookup of their SHA-256 hash.

The RSA keypair is loaded at startup by [`config/keys.ts`](../../src/config/keys.ts):
it reads `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`, runs a sign/verify
self-test, and only `test`/`development` may fall back to an ephemeral in-memory
keypair — any other env throws (fail-closed, never forge tokens silently). The
keypair signs and verifies **access** tokens. Refresh tokens are signed and
verified with `JWT_REFRESH_SECRET` — a symmetric secret (≥32 chars, required).
The `JwtPayload` carries `{ userId, email, role }` only — never `exp`/`iat`/`iat_ms`
(owned by `expiresIn`).

## RefreshToken Model

[`models/refresh-token.ts`](../../src/models/refresh-token.ts):

```ts
{
  token:     { type: String, required: true, unique: true },       // SHA-256 hash, NOT the raw JWT
  userId:    { type: ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },// TTL index → Mongo auto-purges
  familyId:  { type: String, index: true },                         // one per login/register chain
  isRevoked: { type: Boolean, default: false },
  rotatedAt: { type: Date },                                        // set by rotation only (not logout)
}
```

Only the **hash** of the token is stored (`hashToken` = SHA-256 hex), so a DB leak
cannot reconstruct usable tokens. The TTL index (`expires: 0`) auto-deletes
expired documents.

> **Upgrading an existing DB:** the `token` index is now unique. Drop the old
> non-unique `token_1` index (or run `RefreshToken.syncIndexes()`) first —
> Mongoose will not replace an existing index of the same name.

## Cookies

[`utils/cookie.ts`](../../src/utils/cookie.ts) sets both tokens as httpOnly cookies:

```ts
const baseCookieOptions = {
  httpOnly: true,
  secure: config.isProduction,                       // HTTPS-only in prod
  sameSite: config.isProduction ? 'strict' : 'lax',
  path: '/',
};
// accessToken  → path '/',          maxAge = JWT_ACCESS_EXPIRY  (default 15m)
// refreshToken → path `${apiPrefix}/auth`, maxAge = JWT_REFRESH_EXPIRY (default 7d)
//                (only sent to auth routes)
```

Cookie `maxAge`, the refresh token's DB `expiresAt` and the JWT `expiresIn` all
derive from the same two env vars ([`utils/token-lifetimes.ts`](../../src/utils/token-lifetimes.ts)
parses `15m` / `7d` / plain seconds).

The refresh cookie is **path-scoped to `/api/v1/auth`** so the browser only sends
it to the auth endpoints, shrinking its exposure. `clearTokenCookies` clears both
using the matching paths.

## Auth Flows

All flows live in [`modules/auth/service.ts`](../../src/modules/auth/service.ts) /
[`controller.ts`](../../src/modules/auth/controller.ts).

- **register** (`POST /auth/register`) — `validatePasswordStrength`, reject
  duplicate email (409 `CONFLICT`), create user (password hashed by the model
  pre-save hook), sign access + create hashed refresh token, set cookies, `201`.
- **login** (`POST /auth/login`) — find user `+password` select, reject inactive
  or bad credentials (401 `AUTHENTICATION_ERROR`, same message either way),
  `comparePassword` (bcrypt), sign tokens, set cookies. An unknown or inactive
  user still costs one bcrypt compare against a fixed dummy hash, so timing does
  not reveal whether the account exists.
- **refresh** (`POST /auth/refresh`) — read the raw token from the optional body
  `refreshToken` (string; non-string is a 400) or, when absent/empty, the
  `refreshToken` cookie; controller 401s if neither exists. See rotation below.
- **logout** (`POST /auth/logout`) — same token sources; revoke every refresh
  token of the presented token's `familyId` (clearing their `rotatedAt`, so a
  graced predecessor cannot resurrect the session), call
  `revokeUserTokens(userId)` (Redis access-token cutoff), disconnect the user's
  sockets, clear cookies. The user's other families (other devices) keep their
  sessions. Tokens issued before `familyId` existed fall back to revoking just
  the presented token.
- **getMe** (`GET /auth/me`) — `authenticate` middleware required; returns the
  user resolved from `req.user.userId`.

### Refresh Rotation

`AuthService.refresh` rotates on every use — a stolen-and-replayed token is
detectable and the chain self-heals. The old token is **claimed atomically**, so
concurrent refreshes with the same token produce exactly one `200`:

```ts
const hashedToken = hashToken(rawRefreshToken);
const stored = await RefreshToken.findOneAndUpdate(      // 1. atomic claim = revoke OLD
  { token: hashedToken, isRevoked: false, expiresAt: { $gt: new Date() } },
  { isRevoked: true, rotatedAt: new Date() },
);
const token = stored ?? (await classifyUnclaimableToken(hashedToken)); // 2. re-lookup + classify:
//   unknown → 401 · revoked by rotation ≤ REFRESH_REUSE_GRACE_MS ago and unexpired
//   → benign retry, continue and issue a fresh pair · any other revoked token → REUSE:
//   revoke every refresh token of the user (clearing rotatedAt), revokeUserTokens,
//   disconnect their sockets → 401 · expired → deleteOne → 401
// ...resolve user, then:
const accessToken = signAccessToken(payload);
const newRefreshToken = await createRefreshTokenInDb(user._id, payload); // issue NEW
```

Each refresh **revokes the old token and issues a fresh pair**; new cookies are
set by the controller. A refused refresh (`401`: token missing, invalid,
expired, reused or revoked; a `403` from a future guard is handled the same)
clears both token cookies with the options they were set with, then returns the
unchanged error; `5xx`/`429` leave cookies alone.
Clients must single-flight refreshes (the frontend templates lock across tabs).

**Reuse grace window.** A rotated token presented again within
`REFRESH_REUSE_GRACE_MS` (10 s, `modules/auth/service.ts`) is a retry or a race
between tabs, not theft: it gets a fresh access + refresh pair exactly like a
normal refresh and nothing is revoked. This matters in a browser, where the
first response already set new cookies — refusing the second request would clear
them and kill the winning session. Outside the window, or for a token revoked by
logout (which never sets `rotatedAt`), reuse revokes the user's whole family
and disconnects their sockets. That revocation also clears `rotatedAt` on every
token, so replaying a recently rotated token after a family revoke stays a `401`.
A graced retry adds a further live token to the family (same `familyId`); each is
rotated or revoked like any other.

After inserting the new token, `refresh` re-checks (one `exists` query) that the
predecessor still carries `rotatedAt`. Every family or user-wide revoke `$unset`s
it, so if one ran between the claim/grace check and the insert, the new token is
revoked and the request gets `401` (cookies cleared) instead of surviving the
revoke.

Limit of the grace window: a stolen token replayed within it is
indistinguishable from a retry and mints another live token for that family
(bounded by the window, and the next rotation or logout ends the chain).

## Verifying Requests: `authenticate`

[`middleware/auth.ts`](../../src/middleware/auth.ts) protects routes:

1. Extract token from `Authorization: Bearer <t>` or the `accessToken` cookie.
2. `verifyAccessToken` (throws → 401 "Invalid or expired access token!").
3. **User-level revocation check** — `getUserRevokedAt(userId)`: if a cutoff
   exists and the token was issued before it, reject (401 "Token revoked!").
   No-op when Redis is off, and fails open at once when the client is not ready.
4. Attach `req.user = decoded` and `next()`.

## Access-Token Revocation

Access tokens are short-lived and can't be individually unsigned, so logout/ban
records a per-user "revoked at" cutoff in Redis, in epoch **milliseconds**
([`utils/token-revocation.ts`](../../src/utils/token-revocation.ts)). Access tokens
carry an `iat_ms` claim (issue time in ms, next to the standard second-resolution
`iat`); a token with `iat_ms < cutoff` is rejected by `authenticate` and the socket
auth gate. Tokens without `iat_ms` fall back to `iat * 1000`, and cutoffs stored
as seconds by older versions are scaled up, so a token issued in the same second
as a logout is judged correctly (rejected if issued before it, valid if issued
after, e.g. a re-login). With several instances this relies on their clocks agreeing
(NTP); skew shifts the boundary by that much. The key auto-expires after one access-token lifetime
(`accessTtlSeconds()`). When Redis is disabled, `revokeUserTokens` and
`getUserRevokedAt` are no-ops — logout still works (the refresh token is revoked
in Mongo) but outstanding access tokens simply live out their ≤15 min. The same
fail-open applies while Redis is down: `revokeUserTokens` skips the write with a
warning and `getUserRevokedAt` returns `null` immediately.

## See Also

- [hmac-verification.md](./hmac-verification.md) — every auth route is also HMAC-gated
- [database-mongoose.md](./database-mongoose.md) — User model, password hashing, `toJSON`
- [realtime-socket.md](./realtime-socket.md) — sockets reuse `verifyAccessToken` + revocation
