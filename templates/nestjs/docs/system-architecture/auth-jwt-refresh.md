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

|                      | Access token                                        | Refresh token                                   |
| -------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Algorithm            | **RS256** (RSA keypair)                             | **HS256** (symmetric secret)                    |
| Lifetime             | `JWT_ACCESS_EXPIRY` (default `15m`)                 | `JWT_REFRESH_EXPIRY` (default `7d`)             |
| Sent as              | `Authorization: Bearer` **or** `accessToken` cookie | `refreshToken` cookie **or** request body       |
| Stored server-side   | no                                                  | yes — SHA-256 hash in `RefreshToken` collection |
| `token_use` claim    | `access`                                            | `refresh`                                       |
| `iss` (issuer) claim | primary CORS origin                                 | primary CORS origin                             |

The two token classes use different algorithms by design. **Access tokens are
RS256** (asymmetric): the RSA private key signs, the public key verifies — so any
resource server can validate an access token with the distributable public key
without ever holding signing power. **Refresh tokens are HS256** (symmetric),
signed with `this.config.jwtRefreshSecret` (`JWT_REFRESH_SECRET`),
because a refresh token is only ever handled by this auth server — it is never
handed to a third party, so a symmetric secret is the right tool. This is an
intentional separation of concerns, not an inconsistency: distributable
verification for access, issuer-only handling for refresh.

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
`jwtAccessPublicKey`, enforces the `issuer` and asserts `token_use` is `access` —
throwing otherwise. Refresh tokens are signed with `this.config.jwtRefreshSecret`
but never signature-verified on refresh: validity comes from the DB hash lookup.

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
  @Prop({ required: true, unique: true }) token: string; // SHA-256 hash, NOT the raw JWT
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true }) userId: Types.ObjectId;
  @Prop({ required: true, index: { expires: 0 } }) expiresAt: Date; // TTL index → Mongo auto-purges
  @Prop({ default: false }) isRevoked: boolean;
  @Prop({ index: true }) familyId?: string; // device session chain; absent on legacy tokens
  @Prop() rotatedAt?: Date; // set only when consumed by a rotation (drives the reuse grace window)
}
```

Only the **hash** of the token is stored (`hashToken` = SHA-256 hex), so a DB
leak cannot reconstruct usable tokens. The TTL index (`expires: 0`) auto-deletes
expired documents.

> **Upgrading an existing DB:** the `token` index is now unique. Drop the old
> non-unique `token_1` index (or run `refreshTokenModel.syncIndexes()`) first —
> Mongoose will not replace an existing index of the same name.

## Cookies

[`modules/auth/cookie.util.ts`](../../src/modules/auth/cookie.util.ts) sets both tokens as
httpOnly cookies:

```ts
const baseCookieOptions = {
  httpOnly: true,
  secure: config.isProduction, // HTTPS-only in prod
  sameSite: config.isProduction ? "strict" : "lax",
  domain: config.cookieDomain, // optional, host-only when unset
};
// accessToken  → maxAge from JWT_ACCESS_EXPIRY  (default 15m)
// refreshToken → maxAge from JWT_REFRESH_EXPIRY (default 7d)
```

Cookie `maxAge` and the refresh token's stored `expiresAt` are derived from the
same env values by one duration parser (`common/utils/duration.util.ts`). Both
variables accept only a positive integer followed by `s`, `m`, `h` or `d`
(`15m`, `900s`, `7d`); anything else (`900`, `1w`, `0`, `-5m`) fails boot.

`clearTokenCookies` clears both. Because `refresh` and `logout` accept the token
from the request body too, non-browser / SSR clients work without cookies.

**Tokens in the body are by design.** register / login / refresh also return
`{ accessToken, refreshToken }` in the JSON body, because token-mode clients (and
native apps) have no cookie jar. Consequence, accepted: a cookie-mode browser
client with an XSS hole can call `/auth/refresh` and read a fresh refresh token
from the response, which httpOnly alone does not prevent. Mitigation (an opt-in
body-less mode) is backlog.

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
  An unknown or inactive user still pays one bcrypt compare against a fixed dummy
  hash (same cost as real hashes), so response time does not reveal the account.
- **refresh** (`POST /auth/refresh`, `@Public`) — read raw token from body or
  the `refreshToken` cookie; controller 401s if absent. A refused refresh
  (today always 401; a 403 from a future guard is handled the same) clears both
  token cookies (same options as set) before the unchanged error is returned;
  5xx/429 do not. See rotation below.
- **logout** (`POST /auth/logout`, `@Public`) — delete every token of the
  presented token's `familyId` (the device session chain), so neither a graced
  predecessor nor a replay can resurrect it; other families (devices) keep their
  refresh tokens (with Redis on, the cutoff below still invalidates their access
  tokens until they refresh), and a legacy token without `familyId` deletes only itself. A deleted token
  is simply unknown, so replaying it is a plain `401` that does not trip reuse
  detection. Then call `revokeUserTokens(userId)` (Redis
  access-token cutoff), disconnect the user's sockets, clear cookies. Graceful
  when no token is present. A bodyless request works like `{}`.
- **getMe** (`GET /auth/me`) — JWT required; returns the user resolved from
  `req.user.userId` via `@CurrentUser()`.

### Refresh Rotation + Reuse Detection

`RefreshSessionService.refresh` looks the token up by **hash** (no signature verify on the
hot path) and **claims it atomically**, so concurrent refreshes with the same
token produce exactly one `200`:

```ts
const hashedToken = this.tokenService.hashToken(rawRefreshToken);
const claimed = await this.refreshTokenModel.findOneAndUpdate(
  // 1. atomic claim = revoke old
  { token: hashedToken, isRevoked: false, expiresAt: { $gt: new Date() } },
  { isRevoked: true, rotatedAt: new Date() },
);
if (!claimed) return this.resolveUnclaimableToken(hashedToken); // 2. re-lookup + classify:
//   unknown → 401
//   revoked by a rotation ≤ REFRESH_REUSE_GRACE_MS ago, unexpired → benign retry:
//               issue a fresh pair (200), revoke nothing
//   otherwise revoked → REUSE DETECTED (revokeAllUserTokens): updateMany({ userId },
//               { $set: { isRevoked: true }, $unset: { rotatedAt: 1 } })
//               + revokeUserTokens(userId) + disconnect sockets → 401 "Refresh token reuse detected — …"
//   expired → deleteOne → 401
// 3. resolve active user, then issue a fresh access + refresh pair
```

Each refresh **revokes the old token and issues a fresh pair**. If an already
-rotated (revoked) token is replayed after the grace window — the classic
stolen-token signal — every refresh token for that user is revoked, a user-level
access cutoff is set and the user's sockets are disconnected, forcing both the
attacker and the legitimate user to log in again. This is proven by
`test/e2e/refresh-token-reuse-detection.e2e-spec.ts`.

**Reuse grace window.** `REFRESH_REUSE_GRACE_MS` (10 s, in
`modules/auth/refresh-session.service.ts`) separates a benign retry (lost
response, parallel tabs) from theft. A token consumed by a rotation records
`rotatedAt`; replayed within the window it is served like a normal refresh (`200`,
fresh cookies, same body) without revoking anything — a refused refresh would
clear the cookies the first response just set and kill the winner's session.
`familyId` is new on register/login and inherited by every rotation and graced
re-issue. Logout deletes the family, so replaying a logged-out token finds no
record and gets a plain `401` (no user-wide refresh-token revoke; other
families keep their refresh tokens, though logout's Redis cutoff makes their
access tokens `401` until refreshed). Only reuse of a _rotated_ token past the grace window revokes every
token of the user. That revoke clears `rotatedAt` on
every token of the user, so a graced replay cannot resurrect it. See
`test/e2e/refresh-token-reuse-grace.e2e-spec.ts`.

**Revoke racing a rotation.** Both the normal and the graced path insert the
successor N first, then re-read the predecessor P by `_id`. Both revoke paths
remove P's `rotatedAt` (user-wide reuse `$unset`s it, family logout deletes P), so
a missing P or `rotatedAt` means a revoke landed before N existed and could not
cover it: N is revoked and the refresh is refused with the normal 401 (cookies
cleared). A revoke after N's insert already covers N through its `updateMany` /
`deleteMany`. Either ordering leaves no live
token; see `test/e2e/refresh-rotation-revoke-race.e2e-spec.ts`. A stolen token replayed within the window is
indistinguishable from a retry: it mints another live token for that family.
Clients should still single-flight refreshes (the frontend templates lock across tabs).

## Verifying Requests: the JWT step of `SecurityGuard`

[`security.guard.ts`](../../src/common/guards/security.guard.ts) `checkJwt`
protects every non-`@Public` route:

1. Extract token from `Authorization: Bearer <t>` or the `accessToken` cookie.
2. `tokenService.verifyAccessToken` (throws → 401 "Invalid or expired access
   token!").
3. **User-level revocation check** — `getUserRevokedAt(userId)`: if a cutoff
   exists and the token was issued before it (`iat_ms`, else `iat * 1000`),
   reject (401 "Token revoked!").
   Fail-open / no-op when Redis is off.
4. Attach `req.user = decoded`.

## Access-Token Revocation

Access tokens are short-lived and can't be individually unsigned, so logout /
refresh-reuse records a per-user "revoked at" cutoff (epoch milliseconds) in Redis
([`token-revocation.service.ts`](../../src/common/services/token-revocation.service.ts)).
Access tokens carry an `iat_ms` claim (millisecond issue time); a token with
`iat_ms < cutoffMs` (tokens without the claim use `iat * 1000`) is rejected by the
guard's JWT step and the socket auth gate. Millisecond precision closes the
same-second gap: a token issued in the same second as a logout but before it is
revoked, while one issued after it (re-login, graced re-issue) still works. Legacy
epoch-second values already in Redis are scaled to ms on read. The cutoff is stored in ms, so during a rolling upgrade from a version that stored seconds, older instances would reject that user's access tokens until the key expires (one access-token lifetime): drain or upgrade all instances together. When the Redis client
is not `ready` the read fails open and the write is skipped with a warn. The key auto-expires after one access-token lifetime
(`accessTtlSeconds()`). When Redis is disabled, `revokeUserTokens` and
`getUserRevokedAt` are no-ops (fail-open) — logout still works (the refresh token
is revoked in Mongo) but outstanding access tokens simply live out their remaining `JWT_ACCESS_EXPIRY`.

## See Also

- [hmac-verification.md](./hmac-verification.md) — every route is also HMAC-gated
- [database-mongoose.md](./database-mongoose.md) — User model, password hashing, `toJSON`
- [realtime-socket.md](./realtime-socket.md) — sockets reuse `verifyAccessToken` + revocation
