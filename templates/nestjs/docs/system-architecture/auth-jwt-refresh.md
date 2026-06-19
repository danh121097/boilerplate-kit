# Authentication: JWT + Refresh Rotation

Token-based auth with short-lived access tokens and rotating, DB-tracked refresh
tokens delivered as httpOnly cookies, with reuse detection. Source:
[`common/services/token.service.ts`](../../src/common/services/token.service.ts),
[`modules/auth/cookie.util.ts`](../../src/modules/auth/cookie.util.ts),
[`schemas/refresh-token.schema.ts`](../../src/schemas/refresh-token.schema.ts),
[`modules/auth/auth.service.ts`](../../src/modules/auth/auth.service.ts),
[`common/guards/security.guard.ts`](../../src/common/guards/security.guard.ts),
[`common/services/token-revocation.service.ts`](../../src/common/services/token-revocation.service.ts).

## Two Token Types

| | Access token | Refresh token |
| --- | --- | --- |
| Algorithm | **RS256** (RSA keypair) | **HS256** (symmetric secret) |
| Lifetime | `JWT_ACCESS_EXPIRY` (default `15m`) | `JWT_REFRESH_EXPIRY` (default `7d`) |
| Sent as | `Authorization: Bearer` **or** `accessToken` cookie | `refreshToken` cookie **or** request body |
| Stored server-side | no | yes — SHA-256 hash in `RefreshToken` collection |
| `token_use` claim | `access` | `refresh` |
| `iss` (issuer) claim | primary CORS origin | primary CORS origin |

The two token classes use different algorithms by design. **Access tokens are
RS256** (asymmetric): the RSA private key signs, the public key verifies — so any
resource server can validate an access token with the distributable public key
without ever holding signing power. **Refresh tokens are HS256** (symmetric),
signed and verified with `this.config.jwtRefreshSecret` (`JWT_REFRESH_SECRET`),
because a refresh token is only ever verified by this auth server — it is never
handed to a third party, so a symmetric secret is the right tool. This is an
intentional separation of concerns, not an inconsistency: distributable
verification for access, issuer-only verification for refresh.

The `token_use` claim and the `iss` claim are defense in depth on top of the
differing algorithms: a refresh token can never satisfy access verification, and
a token minted for another origin/deployment is rejected. Issuer is the primary
CORS origin; when no origin is configured it is `undefined`, which disables the
check on BOTH sign and verify so local/dev setups keep working.

```ts
// common/services/token.service.ts
signAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, token_use: "access" }, this.config.jwtAccessPrivateKey, {
    algorithm: "RS256", issuer: this.issuer, expiresIn: this.config.jwtAccessExpiry,
  });
}

signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, token_use: "refresh" }, this.config.jwtRefreshSecret, {
    algorithm: "HS256", issuer: this.issuer, expiresIn: this.config.jwtRefreshExpiry,
    jwtid: crypto.randomUUID(),   // unique jti → two tokens are never byte-identical
  });
}
```

`verifyAccessToken` pins `algorithms: ['RS256']` and verifies with
`jwtAccessPublicKey`; `verifyRefreshToken` pins `algorithms: ['HS256']` and
verifies with `this.config.jwtRefreshSecret`. Both enforce the `issuer` and
assert the matching `token_use` — throwing otherwise.

> **Note:** refresh tokens are signed with **HS256** using the symmetric secret
> `JWT_REFRESH_SECRET`, while access tokens are signed with **RS256** using the
> RSA keypair in `src/keys/`. Beyond the algorithm, they also differ by their
> `token_use` claim, their expiry, and the fact that refresh tokens are
> DB-tracked, delivered in an httpOnly cookie, rotated on every use, and
> reuse-detected. The `token_use` claim keeps the two token classes distinct so a
> refresh token can never satisfy access verification.

The RSA keypair (for access tokens) is loaded + self-tested at startup by
`AppConfigService` (`src/config/keys.ts`): it reads `JWT_PRIVATE_KEY_PATH` /
`JWT_PUBLIC_KEY_PATH`, runs a sign/verify self-test, and fails the boot on a
mismatched pair (never forge tokens silently). Refresh tokens are signed and
verified with `JWT_REFRESH_SECRET` — a symmetric secret of at least 32 characters,
required at boot. The `JwtPayload` carries `{ userId, email, role }` only.

## RefreshToken Model

[`schemas/refresh-token.schema.ts`](../../src/schemas/refresh-token.schema.ts):

```ts
@Schema({ timestamps: true })
class RefreshToken {
  @Prop({ required: true, index: true })  token: string;          // SHA-256 hash, NOT the raw JWT
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true }) userId: Types.ObjectId;
  @Prop({ required: true, index: { expires: 0 } }) expiresAt: Date; // TTL index → Mongo auto-purges
  @Prop({ default: false }) isRevoked: boolean;
}
```

Only the **hash** of the token is stored (`hashToken` = SHA-256 hex), so a DB
leak cannot reconstruct usable tokens. The TTL index (`expires: 0`) auto-deletes
expired documents.

## Cookies

[`modules/auth/cookie.util.ts`](../../src/modules/auth/cookie.util.ts) sets both tokens as
httpOnly cookies:

```ts
const baseCookieOptions = {
  httpOnly: true,
  secure: config.isProduction,                       // HTTPS-only in prod
  sameSite: config.isProduction ? "strict" : "lax",
  domain: config.cookieDomain,                        // optional, host-only when unset
};
// accessToken  → maxAge 15 min
// refreshToken → maxAge 7 days
```

`clearTokenCookies` clears both. Because `refresh` and `logout` accept the token
from the request body too, non-browser / SSR clients work without cookies.

## Auth Flows

All flows live in
[`modules/auth/auth.service.ts`](../../src/modules/auth/auth.service.ts) /
[`auth.controller.ts`](../../src/modules/auth/auth.controller.ts).

- **register** (`POST /auth/register`, `@Public`) — `validatePasswordStrength`,
  reject duplicate email (409 `CONFLICT`), create user (password hashed by the
  schema pre-save hook), sign access + create hashed refresh, set cookies, `201`.
- **login** (`POST /auth/login`, `@Public`) — find user `+password`, reject
  inactive or bad credentials (401 `AUTHENTICATION_ERROR`, **same message either
  way** — no enumeration), `comparePassword` (bcrypt), sign tokens, set cookies.
- **refresh** (`POST /auth/refresh`, `@Public`) — read raw token from body or
  the `refreshToken` cookie; controller 401s if absent. See rotation below.
- **logout** (`POST /auth/logout`, `@Public`) — mark the stored refresh token
  `isRevoked`, call `revokeUserTokens(userId)` (Redis access-token cutoff), clear
  cookies. Graceful when no token is present.
- **getMe** (`GET /auth/me`) — JWT required; returns the user resolved from
  `req.user.userId` via `@CurrentUser()`.

### Refresh Rotation + Reuse Detection

`AuthService.refresh` looks the token up by **hash** (no signature verify on the
hot path), then branches in a fixed order:

```ts
const hashedToken = this.tokenService.hashToken(rawRefreshToken);
const stored = await this.refreshTokenModel.findOne({ token: hashedToken });
if (!stored) throw 401;                       // 1. unknown token

if (stored.isRevoked) {                        // 2. REUSE DETECTED
  await this.refreshTokenModel.updateMany({ userId: stored.userId }, { isRevoked: true });
  await this.tokenRevocationService.revokeUserTokens(String(stored.userId));
  throw 401 "Refresh token reuse detected — all sessions have been revoked!";
}

if (stored.expiresAt < new Date()) { await stored.deleteOne(); throw 401; } // 3. expired

stored.isRevoked = true; await stored.save();  // 4. rotate: revoke old
// resolve active user, then issue a fresh access + refresh pair
```

Each refresh **revokes the old token and issues a fresh pair**. If an already
-rotated (revoked) token is replayed — the classic stolen-token signal — every
refresh token for that user is revoked and a user-level access cutoff is set,
forcing both the attacker and the legitimate user to log in again. This is proven
by `test/e2e/refresh-token-reuse-detection.e2e-spec.ts`.

## Verifying Requests: the JWT step of `SecurityGuard`

[`security.guard.ts`](../../src/common/guards/security.guard.ts) `checkJwt`
protects every non-`@Public` route:

1. Extract token from `Authorization: Bearer <t>` or the `accessToken` cookie.
2. `tokenService.verifyAccessToken` (throws → 401 "Invalid or expired access
   token!").
3. **User-level revocation check** — `getUserRevokedAt(userId)`: if a cutoff
   exists and the token's `iat` predates it, reject (401 "Token revoked!").
   Fail-open / no-op when Redis is off.
4. Attach `req.user = decoded`.

## Access-Token Revocation

Access tokens are short-lived and can't be individually unsigned, so logout /
refresh-reuse records a per-user "revoked at" epoch in Redis
([`token-revocation.service.ts`](../../src/common/services/token-revocation.service.ts)).
Any access token with `iat < revokedAt` is rejected by the guard's JWT step and
the socket auth gate. The key auto-expires after one access-token lifetime
(`accessTtlSeconds()`). When Redis is disabled, `revokeUserTokens` and
`getUserRevokedAt` are no-ops (fail-open) — logout still works (the refresh token
is revoked in Mongo) but outstanding access tokens simply live out their ≤15 min.

## See Also

- [hmac-verification.md](./hmac-verification.md) — every route is also HMAC-gated
- [database-mongoose.md](./database-mongoose.md) — User model, password hashing, `toJSON`
- [realtime-socket.md](./realtime-socket.md) — sockets reuse `verifyAccessToken` + revocation
