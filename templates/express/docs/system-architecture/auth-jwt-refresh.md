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
| Algorithm | **RS256** (RSA private/public keypair) | **HS256** (shared secret) |
| Lifetime | `JWT_ACCESS_EXPIRY` (default `15m`) | `JWT_REFRESH_EXPIRY` (default `7d`) |
| Sent as | `Authorization: Bearer` **or** `accessToken` cookie | `refreshToken` httpOnly cookie |
| Stored server-side | no | yes — SHA-256 hash in `RefreshToken` collection |
| `token_use` claim | `access` | `refresh` |
| `iss` (issuer) claim | primary CORS origin | primary CORS origin |

The two algorithms, the `token_use` claim, and the `iss` (issuer) claim are
defense in depth: a refresh token can never satisfy access verification, and a
token minted for another origin/deployment is rejected. Issuer is a single
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

`verifyAccessToken` / `verifyRefreshToken` pin the algorithm (`algorithms:
['RS256' | 'HS256']`), enforce the `issuer`, and assert the matching `token_use` —
throwing otherwise. Verification order: signature → algorithm → issuer → `token_use`.

The RSA keypair is loaded at startup by [`config/keys.ts`](../../src/config/keys.ts):
it reads `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`, runs a sign/verify
self-test, and only `test`/`development` may fall back to an ephemeral in-memory
keypair — any other env throws (fail-closed, never forge tokens silently). The
`JwtPayload` carries `{ userId, email, role }` only — never `exp`/`iat` (owned by
`expiresIn`).

## RefreshToken Model

[`models/refresh-token.ts`](../../src/models/refresh-token.ts):

```ts
{
  token:     { type: String, required: true, index: true },        // SHA-256 hash, NOT the raw JWT
  userId:    { type: ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },// TTL index → Mongo auto-purges
  isRevoked: { type: Boolean, default: false },
}
```

Only the **hash** of the token is stored (`hashToken` = SHA-256 hex), so a DB leak
cannot reconstruct usable tokens. The TTL index (`expires: 0`) auto-deletes
expired documents.

## Cookies

[`utils/cookie.ts`](../../src/utils/cookie.ts) sets both tokens as httpOnly cookies:

```ts
const baseCookieOptions = {
  httpOnly: true,
  secure: config.isProduction,                       // HTTPS-only in prod
  sameSite: config.isProduction ? 'strict' : 'lax',
  path: '/',
};
// accessToken  → path '/',          maxAge 15 min
// refreshToken → path `${apiPrefix}/auth`, maxAge 7 days  (only sent to auth routes)
```

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
  `comparePassword` (bcrypt), sign tokens, set cookies.
- **refresh** (`POST /auth/refresh`) — read raw token from the `refreshToken`
  cookie; controller 401s if absent. See rotation below.
- **logout** (`POST /auth/logout`) — mark the stored refresh token `isRevoked`,
  call `revokeUserTokens(userId)` (Redis access-token cutoff), clear cookies.
- **getMe** (`GET /auth/me`) — `authenticate` middleware required; returns the
  user resolved from `req.user.userId`.

### Refresh Rotation

`AuthService.refresh` rotates on every use — a stolen-and-replayed token is
detectable and the chain self-heals:

```ts
const hashedToken = hashToken(rawRefreshToken);
const stored = await RefreshToken.findOne({ token: hashedToken, isRevoked: false });
if (!stored || stored.expiresAt < new Date()) {
  if (stored) await stored.deleteOne();
  throw new AppError({ statusCode: 401, errorType: 'AUTHENTICATION_ERROR', ... });
}
stored.isRevoked = true;          // revoke the OLD token
await stored.save();
// ...resolve user, then:
const accessToken = signAccessToken(payload);
const newRefreshToken = await createRefreshTokenInDb(user._id, payload); // issue NEW
```

Each refresh **revokes the old token and issues a fresh pair**; new cookies are
set by the controller.

## Verifying Requests: `authenticate`

[`middleware/auth.ts`](../../src/middleware/auth.ts) protects routes:

1. Extract token from `Authorization: Bearer <t>` or the `accessToken` cookie.
2. `verifyAccessToken` (throws → 401 "Invalid or expired access token!").
3. **User-level revocation check** — `getUserRevokedAt(userId)`: if a cutoff
   exists and the token's `iat` predates it, reject (401 "Token revoked!").
   No-op when Redis is off.
4. Attach `req.user = decoded` and `next()`.

## Access-Token Revocation

Access tokens are short-lived and can't be individually unsigned, so logout/ban
records a per-user "revoked at" epoch in Redis
([`utils/token-revocation.ts`](../../src/utils/token-revocation.ts)). Any access
token with `iat < revokedAt` is rejected by `authenticate` and the socket auth
gate. The key auto-expires after one access-token lifetime
(`accessTtlSeconds()`). When Redis is disabled, `revokeUserTokens` and
`getUserRevokedAt` are no-ops — logout still works (the refresh token is revoked
in Mongo) but outstanding access tokens simply live out their ≤15 min.

## See Also

- [hmac-verification.md](./hmac-verification.md) — every auth route is also HMAC-gated
- [database-mongoose.md](./database-mongoose.md) — User model, password hashing, `toJSON`
- [realtime-socket.md](./realtime-socket.md) — sockets reuse `verifyAccessToken` + revocation
